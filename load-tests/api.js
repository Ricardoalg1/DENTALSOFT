// Prueba de carga de la API de Occlus. Cada usuario virtual (VU) es una persona trabajando en la
// aplicación: hace una acción, piensa de 1 a 3 segundos y sigue. Ver docs/pruebas-de-carga.md.
//
// Variables: USERS (usuarios simultáneos), RAMP (subida y calentamiento), DURATION (carga sostenida),
// CLINICS (clínicas de prueba), PATIENTS (pacientes por clínica), LOGINS_PER_SECOND, BASE_URL.
import { check, fail, sleep } from 'k6';
import exec from 'k6/execution';
import http from 'k6/http';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const USERS = Number(__ENV.USERS || 100);
const RAMP = __ENV.RAMP || '1m';
const DURATION = __ENV.DURATION || '3m';
const CLINICS = Number(__ENV.CLINICS || 10);
const PATIENTS = Number(__ENV.PATIENTS || 100);
const LOGINS_PER_SECOND = Number(__ENV.LOGINS_PER_SECOND || 1);
const PASSWORD = 'Carga-Occlus-9271';
const ENDPOINTS = ['login', 'perfil', 'pacientes', 'buscar_paciente', 'ver_paciente', 'citas_paciente', 'agenda',
  'sedes', 'profesionales', 'reporte', 'crear_paciente', 'crear_cita'];

const sum = (a, b) => a + b;
const sustained = 'flow:sostenida';

export const options = {
  // setup crea los datos de prueba; sus peticiones no cuentan para los umbrales.
  setupTimeout: '10m',
  scenarios: {
    // La JVM recién arrancada es lenta hasta compilar el código: el calentamiento no se evalúa.
    calentamiento: {
      executor: 'ramping-vus',
      stages: [{ duration: RAMP, target: USERS }],
      gracefulRampDown: '0s',
      gracefulStop: '0s',
      tags: { flow: 'calentamiento' },
    },
    sostenida: {
      executor: 'constant-vus',
      vus: USERS,
      duration: DURATION,
      startTime: RAMP,
      tags: { flow: 'sostenida' },
    },
    // bcrypt es caro a propósito: las sesiones duran 8 horas, así que el ingreso es poco frecuente.
    ingresos: {
      executor: 'constant-arrival-rate',
      exec: 'login',
      rate: LOGINS_PER_SECOND,
      timeUnit: '1s',
      duration: DURATION,
      startTime: RAMP,
      preAllocatedVUs: 5,
      maxVUs: 50,
      tags: { flow: 'sostenida' },
    },
  },
  thresholds: {
    [`http_req_duration{${sustained}}`]: ['p(95)<200'],
    [`http_req_failed{${sustained}}`]: ['rate<0.01'],
    // Sin peticiones, los dos umbrales anteriores pasarían sin haber medido nada.
    [`http_reqs{${sustained}}`]: ['count>0'],
    // Sin umbral real: solo hacen que el resumen separe los tiempos por operación.
    ...Object.fromEntries(ENDPOINTS.map((name) => [`http_req_duration{${sustained},name:${name}}`, ['p(95)>=0']])),
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const json = (token) => ({
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
});

const newPatient = (document, lastName) => JSON.stringify({
  documentType: 'CC',
  documentNumber: document,
  firstName: 'Paciente',
  firstLastName: lastName,
  birthDate: '1990-05-17',
  sex: 'M',
  regime: 'CONTRIBUTIVO',
  phone: '3001234567',
});

const LAST_NAMES = ['Gomez', 'Rodriguez', 'Martinez', 'Lopez', 'Perez', 'Garcia', 'Torres', 'Ramirez'];

function must(res, what) {
  if (res.status < 200 || res.status >= 300) fail(`${what}: HTTP ${res.status} ${res.body}`);
  return res.json();
}

/** Semana actual en hora de Colombia, como la pide la agenda. */
function currentWeek() {
  const from = new Date();
  from.setUTCHours(5, 0, 0, 0);
  from.setUTCDate(from.getUTCDate() - from.getUTCDay());
  const to = new Date(from.getTime() + 7 * 24 * 3600 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function setup() {
  const run = Date.now().toString(36);
  const week = currentWeek();
  const clinics = [];
  for (let c = 0; c < CLINICS; c++) {
    const email = `carga-${run}-${c}@occlus.test`;
    const { accessToken: token } = must(http.post(`${BASE_URL}/api/auth/register`, JSON.stringify({
      clinicName: `Clínica de carga ${c}`, fullName: 'Persona de carga', email, password: PASSWORD,
    }), json()), 'registrar clínica');
    const siteId = must(http.get(`${BASE_URL}/api/sites`, json(token)), 'sedes')[0].id;
    const dentistId = must(http.get(`${BASE_URL}/api/professionals`, json(token)), 'profesionales')[0].id;

    const patients = [];
    for (let start = 0; start < PATIENTS; start += 20) {
      const batch = [];
      for (let p = start; p < Math.min(start + 20, PATIENTS); p++) {
        batch.push(['POST', `${BASE_URL}/api/patients`,
          newPatient(`${run}${c}x${p}`, LAST_NAMES[p % LAST_NAMES.length]), json(token)]);
      }
      http.batch(batch).forEach((res) => patients.push(must(res, 'crear paciente').id));
    }

    // Una agenda de semana llena: 8 citas diarias de lunes a sábado.
    const appointments = [];
    for (let day = 1; day <= 6; day++) {
      for (let slot = 0; slot < 8; slot++) {
        const startsAt = new Date(new Date(week.from).getTime() + (day * 24 + 8 + slot) * 3600 * 1000).toISOString();
        appointments.push(['POST', `${BASE_URL}/api/appointments`, JSON.stringify({
          patientId: patients[(day * 8 + slot) % patients.length], dentistId, siteId, startsAt, durationMinutes: 45,
        }), json(token)]);
      }
    }
    http.batch(appointments).forEach((res) => must(res, 'crear cita'));
    clinics.push({ token, email, siteId, dentistId, patients });
  }
  return { clinics, week, run };
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function get(path, name, token) {
  const res = http.get(`${BASE_URL}${path}`, { ...json(token), tags: { name } });
  check(res, { 'respuesta 2xx': (r) => r.status >= 200 && r.status < 300 });
}

/** Lo que hace una persona, con el peso aproximado de cada acción en un día de consultorio. */
const ACTIONS = [
  [30, 'agenda', (d, c) => get(`/api/appointments?from=${d.week.from}&to=${d.week.to}`, 'agenda', c.token)],
  [20, 'pacientes', (d, c) => get(`/api/patients?page=${Math.floor(Math.random() * 3)}&size=20`, 'pacientes', c.token)],
  [15, 'buscar_paciente', (d, c) => get(`/api/patients?q=${pick(LAST_NAMES)}&size=20`, 'buscar_paciente', c.token)],
  [10, 'ver_paciente', (d, c) => {
    const id = pick(c.patients);
    get(`/api/patients/${id}`, 'ver_paciente', c.token);
    get(`/api/patients/${id}/appointments`, 'citas_paciente', c.token);
  }],
  [8, 'perfil', (d, c) => get('/api/auth/me', 'perfil', c.token)],
  [4, 'sedes', (d, c) => {
    get('/api/sites', 'sedes', c.token);
    get('/api/professionals', 'profesionales', c.token);
  }],
  [3, 'reporte', (d, c) => get(`/api/reports?from=${d.week.from.slice(0, 10)}&to=${d.week.to.slice(0, 10)}`, 'reporte', c.token)],
  [6, 'crear_paciente', (d, c) => {
    const doc = `${d.run}${exec.vu.idInTest.toString(36)}y${exec.vu.iterationInInstance.toString(36)}`.slice(-20);
    const res = http.post(`${BASE_URL}/api/patients`, newPatient(doc, pick(LAST_NAMES)),
      { ...json(c.token), tags: { name: 'crear_paciente' } });
    check(res, { 'paciente creado': (r) => r.status === 201 });
  }],
  [4, 'crear_cita', (d, c) => {
    // Un horario al azar en los próximos cinco años. Si ya está ocupado, el 409 es la respuesta correcta.
    const slot = Math.floor(Math.random() * 5 * 365 * 48);
    const startsAt = new Date(Date.now() + (slot + 48) * 1800 * 1000);
    startsAt.setUTCMinutes(startsAt.getUTCMinutes() >= 30 ? 30 : 0, 0, 0);
    const res = http.post(`${BASE_URL}/api/appointments`, JSON.stringify({
      patientId: pick(c.patients), dentistId: c.dentistId, siteId: c.siteId, startsAt: startsAt.toISOString(), durationMinutes: 30,
    }), { ...json(c.token), tags: { name: 'crear_cita' }, responseCallback: http.expectedStatuses(201, 409) });
    check(res, { 'cita creada u horario ocupado': (r) => r.status === 201 || r.status === 409 });
  }],
];
const TOTAL_WEIGHT = ACTIONS.map(([weight]) => weight).reduce(sum, 0);

export default function (data) {
  const clinic = data.clinics[exec.vu.idInTest % data.clinics.length];
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const [weight, , action] of ACTIONS) {
    roll -= weight;
    if (roll < 0) {
      action(data, clinic);
      break;
    }
  }
  sleep(1 + Math.random() * 2);
}

export function login(data) {
  const res = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({ email: pick(data.clinics).email, password: PASSWORD }),
    { ...json(), tags: { name: 'login' } });
  check(res, { 'ingreso correcto': (r) => r.status === 200 });
}
