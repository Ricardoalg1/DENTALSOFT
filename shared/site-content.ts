export const plans = [
  {
    id: "ESTANDAR",
    name: "Esencial",
    users: "1 a 5 usuarios",
    monthly: 99000,
    annual: 990000,
    description:
      "Organiza el día a día de tu consultorio con las herramientas esenciales.",
    support: "Orientación para comenzar",
    focus: [
      "Agenda y disponibilidad del consultorio",
      "Evoluciones y odontograma en un lugar",
      "Presupuestos y registro de pagos",
    ],
  },
  {
    id: "CRECIMIENTO",
    name: "Equipo",
    users: "6 a 10 usuarios",
    monthly: 179000,
    annual: 1788000,
    description:
      "Coordina un equipo más grande y acompaña el crecimiento de tu clínica.",
    support: "Acompañamiento para tu equipo",
    focus: [
      "Coordinación de profesionales y recepción",
      "Acceso a la información según el rol",
      "Seguimiento de tratamientos y recaudo",
    ],
  },
  {
    id: "EXPANSION",
    name: "Integral",
    users: "11 a 15 usuarios",
    monthly: 239000,
    annual: 2388000,
    description:
      "Centraliza la operación de tu equipo y mantén una visión clara del negocio.",
    support: "Acompañamiento para tu operación",
    focus: [
      "Organización de equipos y sedes",
      "Control de insumos, lotes y consumos",
      "Visibilidad de la operación con reportes",
    ],
  },
  {
    id: "INTERNACIONAL",
    name: "Global",
    users: "Usuarios según tu necesidad",
    monthly: null,
    annual: null,
    description:
      "Conversemos sobre tu operación fuera de Colombia y las adaptaciones que necesitas.",
    support: "Soporte acordado en la propuesta",
    focus: [
      "Alcance definido para tu país y equipo",
      "Revisión de necesidades de adaptación",
      "Integraciones evaluadas en la propuesta",
    ],
  },
] as const;
export const money = (value: number) =>
  new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value);
export const articles = [
  {
    slug: "organizar-agenda-clinica",
    title: "Una agenda que le da espacio a tu equipo",
    summary:
      "Tres hábitos para coordinar citas, disponibilidad y cambios durante el día.",
    category: "Agenda",
    sections: [
      [
        "Empieza por la disponibilidad",
        "Antes de abrir nuevos horarios, revisa quién atiende en cada sede y qué espacios necesita cada procedimiento. Un horario compartido ayuda a recepción a ofrecer citas con el contexto correcto.",
      ],
      [
        "Registra los cambios donde trabaja el equipo",
        "Cuando una cita cambia, actualiza su estado y sus notas en la agenda. Evita que la confirmación quede únicamente en una conversación privada que el resto del equipo no puede consultar.",
      ],
      [
        "Cierra el día con una revisión breve",
        "Revisa las citas pendientes y los espacios del día siguiente. Separa las tareas de contacto de los asuntos clínicos y acuerda quién dará seguimiento a cada paciente.",
      ],
    ],
  },
  {
    slug: "control-insumos-odontologia",
    title: "Control de insumos sin depender de la memoria",
    summary:
      "Haz visibles las existencias, los movimientos y las necesidades de reposición.",
    category: "Inventario",
    sections: [
      [
        "Define una unidad por producto",
        "Escoge la unidad con la que tu equipo registra entradas y salidas. Si compras cajas y consumes unidades, documenta la conversión antes de registrar movimientos.",
      ],
      [
        "Registra cada movimiento",
        "Anota las entradas, los consumos y los ajustes con una explicación breve. Un ajuste de inventario debe reflejar una revisión física, no reemplazar el registro de consumos.",
      ],
      [
        "Revisa los mínimos con frecuencia",
        "Compara las existencias con la demanda de las próximas citas y los tiempos de compra. Revisa los lotes y las fechas de vencimiento para planear el uso de los insumos.",
      ],
    ],
  },
  {
    slug: "seguimiento-presupuestos",
    title: "Dale seguimiento a cada presupuesto",
    summary:
      "Una rutina simple para coordinar propuestas, aceptación y cobros.",
    category: "Gestión",
    sections: [
      [
        "Deja una propuesta clara",
        "Registra los tratamientos propuestos, sus cantidades y sus valores. Revisa la propuesta con el paciente y deja constancia de los acuerdos antes de cambiar su estado.",
      ],
      [
        "Acuerda el siguiente paso",
        "Asigna una persona responsable del seguimiento y registra cuándo se retomará la conversación. Respeta las preferencias de contacto del paciente y evita mensajes repetidos.",
      ],
      [
        "Separa aceptación y recaudo",
        "Un presupuesto aceptado y un pago registrado representan pasos diferentes. Consulta ambos antes de coordinar las siguientes citas y concilia los movimientos de caja al finalizar la jornada.",
      ],
    ],
  },
] as const;
