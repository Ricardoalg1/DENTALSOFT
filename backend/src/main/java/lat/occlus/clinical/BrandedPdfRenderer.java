package lat.occlus.clinical;
import java.io.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.springframework.stereotype.Service;

@Service @RequiredArgsConstructor
public class BrandedPdfRenderer {
 private final DocumentBrandingService branding;
 public byte[] render(UUID clinic,DocumentBrandingService.Branding brand,List<String> paragraphs,Map<String,UUID> signatures) {
  try(var doc=new PDDocument();var out=new ByteArrayOutputStream();var fontFile=getClass().getResourceAsStream("/fonts/NotoSans-Regular.ttf")) {
   if(fontFile==null)throw new IOException("Fuente no disponible");
   var font=PDType0Font.load(doc,fontFile);doc.getDocumentInformation().setAuthor(brand.name());doc.getDocumentInformation().setTitle(paragraphs.isEmpty()?"Documento clínico":paragraphs.getFirst());
   var logo=brand.logoId()==null?null:PDImageXObject.createFromByteArray(doc,branding.image(clinic,brand.logoId()),"logo");
   try(var writer=new Writer(doc,font,brand,logo)) {
    int paragraphIndex=0;
    for(var paragraph:paragraphs) {
     boolean title=paragraphIndex++==0;
     UUID signature=signatures.get(paragraph);
     boolean heading=paragraph.startsWith("MEDICAMENTO ") || paragraph.length()>0&&paragraph.length()<110&&paragraph.equals(paragraph.toUpperCase(Locale.ROOT))&&paragraph.chars().anyMatch(Character::isLetter);
     if(paragraph.startsWith("FIRMA | "))heading=true;
     var lines=wrap(paragraph.startsWith("FIRMA | ")?"FIRMA DEL PROFESIONAL":paragraph,font,499,title?16:heading?11:10);
     if(signature!=null)writer.space(190);
     if(heading)writer.space(34);
     for(var line:lines)writer.line(line,heading,title);
     if(signature!=null)writer.signature(PDImageXObject.createFromByteArray(doc,branding.image(clinic,signature),"firma"));
    }
   }
   doc.save(out);return out.toByteArray();
  }catch(IOException|IllegalArgumentException ex){throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"No se pudo generar el PDF. Revisa los caracteres o imágenes del documento.");}
 }
 private static class Writer implements AutoCloseable {
  final PDDocument doc;final PDType0Font font;final DocumentBrandingService.Branding brand;final PDImageXObject logo;
  PDPageContentStream stream;float y;int page;
  Writer(PDDocument doc,PDType0Font font,DocumentBrandingService.Branding brand,PDImageXObject logo)throws IOException{this.doc=doc;this.font=font;this.brand=brand;this.logo=logo;newPage();}
  void newPage()throws IOException {
   if(stream!=null)stream.close();var p=new PDPage(PDRectangle.A4);doc.addPage(p);stream=new PDPageContentStream(doc,p);page++;
   float left=logo==null?48:140;
   var names=wrap(brand.name().replaceAll("\\s+"," "),font,547-left,12);
   var contact=new ArrayList<String>();
   for(var c:List.of(brand.address(),join(brand.phone(),brand.email()),brand.nit()==null?"":"NIT: "+brand.nit())) {
    if(!c.isBlank())contact.addAll(wrap(c.replaceAll("\\s+"," "),font,547-left,8));
   }
   float bottom=810-Math.max(90,names.size()*16+contact.size()*11+26);
   stream.setNonStrokingColor(.94f,.98f,.98f);stream.addRect(32,bottom,531,810-bottom);stream.fill();
   if(logo!=null)image(logo,48,740,72,56);
   stream.setNonStrokingColor(.035f,.14f,.30f);
   float top=788;for(var line:names){text(stream,font,12,left,top,line);top-=16;}
   stream.setNonStrokingColor(.32f,.43f,.55f);
   for(var line:contact){text(stream,font,8,left,top,line);top-=11;}
   stream.setStrokingColor(.03f,.49f,.55f);stream.setLineWidth(2);stream.moveTo(32,bottom);stream.lineTo(563,bottom);stream.stroke();
   stream.setNonStrokingColor(.32f,.43f,.55f);text(stream,font,8,48,28,"Occlus | Documento confidencial | Página "+page);
   y=bottom-26;
  }
  void space(float amount)throws IOException{if(y-amount<55)newPage();}
  void line(String line,boolean heading,boolean title)throws IOException{space(title?30:heading?24:15);stream.setNonStrokingColor(heading&&!title?.03f:.05f,heading&&!title?.49f:.14f,heading&&!title?.55f:.30f);text(stream,font,title?16:heading?11:10,48,y,line);y-=title?30:heading?21:15;}
  void signature(PDImageXObject img)throws IOException{space(80);image(img,48,y-65,180,60);y-=80;stream.setStrokingColor(.75f,.83f,.87f);stream.setLineWidth(.5f);stream.moveTo(48,y+8);stream.lineTo(268,y+8);stream.stroke();y-=6;}
  void image(PDImageXObject img,float x,float bottom,float maxW,float maxH)throws IOException{float scale=Math.min(maxW/img.getWidth(),maxH/img.getHeight());stream.drawImage(img,x,bottom,img.getWidth()*scale,img.getHeight()*scale);}
  public void close()throws IOException{if(stream!=null)stream.close();}
 }
 private static String join(String a,String b){return a.isBlank()?b:b.isBlank()?a:a+" | "+b;}
 private static void text(PDPageContentStream s,PDType0Font f,int size,float x,float y,String t)throws IOException{s.beginText();s.setFont(f,size);s.newLineAtOffset(x,y);s.showText(t);s.endText();}
 private static List<String> wrap(String text,PDType0Font font,float width,int size)throws IOException {
  var out=new ArrayList<String>();for(var p:text.replace("\t","    ").split("\\R",-1)) {
   var clean=new StringBuilder();p.codePoints().filter(c->!Character.isISOControl(c)).forEach(clean::appendCodePoint);var line=new StringBuilder();
   for(var word:clean.toString().split("(?<=\\s)")) {
    if(!line.isEmpty()&&font.getStringWidth(line+word)/1000*size>width){out.add(line.toString().stripTrailing());line.setLength(0);}
    for(var cp:word.codePoints().toArray()){var c=new String(Character.toChars(cp));if(!line.isEmpty()&&font.getStringWidth(line+c)/1000*size>width){out.add(line.toString());line.setLength(0);}line.append(c);}
   }out.add(line.toString().stripTrailing());
  }return out;
 }
}
