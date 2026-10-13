"""Regenera la selección odontológica desde el ZIP oficial de la Res. 2706/2025.
Uso: python3 scripts/import-cups-2026.py /ruta/resolucion-2706-de-2025.zip
"""
import zipfile,xml.etree.ElementTree as E,io,re,json,hashlib,sys
from pathlib import Path
z=zipfile.ZipFile(sys.argv[1]); raw=z.read(next(n for n in z.namelist() if '/Anexos ' in n)); w=zipfile.ZipFile(io.BytesIO(raw)); ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
strings=[''.join(x.itertext()) for x in E.fromstring(w.read('xl/sharedStrings.xml'))]
data=[]
for r in E.fromstring(w.read('xl/worksheets/sheet3.xml')).findall('.//s:row',ns):
 cells={re.sub(r'\d','',c.attrib['r']): strings[int(c.find('s:v',ns).text)] if c.attrib.get('t')=='s' else c.findtext('s:v','',ns) for c in r}
 code=cells.get('A','').strip(); description=cells.get('B','').strip()
 if not re.fullmatch(r'\d{6}',code): continue
 category=None
 if code.startswith('23'):
  category={'230':'Cirugía oral','231':'Cirugía oral','232':'Restauradora','233':'Rehabilitación','234':'Rehabilitación','235':'Rehabilitación','236':'Rehabilitación','237':'Endodoncia'}.get(code[:3])
 elif code.startswith('24'): category='Ortodoncia' if code.startswith(('247','248')) else 'Cirugía oral' if code.startswith('249') else 'Periodoncia'
 elif code.startswith('8704') and 'INTRAORAL' in description: category='Diagnóstica'
 elif code.startswith('8931'): category='Diagnóstica'
 elif code.startswith('890') and ('ODONTOL' in description): category='Consulta'
 elif code in ('990103','990112','990203','990212'): category='Educación en salud'
 elif code.startswith('997'): category='Preventiva'
 if category: data.append({'code':code,'description':description,'category':category})
assert len(data)>150 and len({d['code'] for d in data})==len(data)
open(Path(__file__).resolve().parents[1] / 'frontend/src/lib/cups/catalog.json','w').write(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print(len(data),hashlib.sha256(raw).hexdigest())
