package lat.occlus.migration;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import lat.occlus.migration.MigrationDtos.SheetResponse;
import lat.occlus.shared.web.BadRequestException;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.openxml4j.opc.OPCPackage;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.util.CellReference;
import org.apache.poi.util.XMLHelper;
import org.apache.poi.xssf.eventusermodel.ReadOnlySharedStringsTable;
import org.apache.poi.xssf.eventusermodel.XSSFReader;
import org.apache.poi.xssf.eventusermodel.XSSFSheetXMLHandler;
import org.apache.poi.xssf.eventusermodel.XSSFSheetXMLHandler.SheetContentsHandler;
import org.apache.poi.xssf.usermodel.XSSFComment;
import org.springframework.stereotype.Component;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;

/**
 * Lee la primera hoja del archivo que exportó el programa anterior (CSV, XLSX o XLS) y la devuelve como
 * texto: la primera fila no vacía son los encabezados. Las fechas de Excel salen en ISO (1990-03-15) para
 * no depender del formato regional de la celda.
 */
@Component
class SheetReader {

    static final int MAX_ROWS = 20_000;
    static final int MAX_COLUMNS = 80;
    private static final int MAX_CELL = 20_000;

    SheetResponse read(String fileName, byte[] content) {
        if (content.length == 0) throw new BadRequestException("El archivo está vacío");
        var collector = new Collector();
        try {
            if (startsWith(content, 0x50, 0x4B, 0x03, 0x04)) readXlsx(content, collector);
            else if (startsWith(content, 0xD0, 0xCF, 0x11, 0xE0)) readXls(content, collector);
            else readCsv(content, collector);
        } catch (Collector.Full ignored) {
            // Se alcanzó el máximo de filas: se devuelve lo leído y se avisa con truncated = true.
        } catch (IOException | SAXException | RuntimeException e) {
            if (e instanceof BadRequestException bad) throw bad;
            throw new BadRequestException(
                    "No se pudo leer el archivo. Guárdalo de nuevo como Excel (.xlsx) o CSV e intenta otra vez.");
        }
        return collector.result(fileName);
    }

    // ---------- CSV ----------

    private static void readCsv(byte[] content, Collector out) {
        String text = decode(content);
        if (!text.isEmpty() && text.charAt(0) == '﻿') text = text.substring(1);
        char sep = separator(text);
        var row = new ArrayList<String>();
        var field = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (quoted) {
                if (c == '"' && i + 1 < text.length() && text.charAt(i + 1) == '"') {
                    field.append('"');
                    i++;
                } else if (c == '"') {
                    quoted = false;
                } else {
                    field.append(c);
                }
            } else if (c == '"' && field.isEmpty()) {
                quoted = true;
            } else if (c == sep) {
                row.add(field.toString());
                field.setLength(0);
            } else if (c == '\n' || c == '\r') {
                if (c == '\r' && i + 1 < text.length() && text.charAt(i + 1) == '\n') i++;
                row.add(field.toString());
                field.setLength(0);
                out.row(row);
                row = new ArrayList<>();
            } else {
                field.append(c);
            }
        }
        if (!field.isEmpty() || !row.isEmpty()) {
            row.add(field.toString());
            out.row(row);
        }
    }

    /** UTF-8 si el archivo es UTF-8 válido; si no, Windows-1252 (lo que guardan Excel y muchos programas viejos). */
    private static String decode(byte[] content) {
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(content)).toString();
        } catch (CharacterCodingException e) {
            return new String(content, Charset.forName("windows-1252"));
        }
    }

    /** El separador más frecuente en la primera línea (fuera de comillas): ";" en Excel en español, "," o tabulador. */
    private static char separator(String text) {
        int semicolons = 0, commas = 0, tabs = 0;
        boolean quoted = false;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '"') quoted = !quoted;
            else if (!quoted && (c == '\n' || c == '\r')) break;
            else if (!quoted && c == ';') semicolons++;
            else if (!quoted && c == ',') commas++;
            else if (!quoted && c == '\t') tabs++;
        }
        if (tabs > semicolons && tabs > commas) return '\t';
        return semicolons >= commas ? ';' : ',';
    }

    // ---------- Excel ----------

    /** XLSX en modo streaming (SAX): no carga el libro completo en memoria. */
    private static void readXlsx(byte[] content, Collector out) throws IOException, SAXException {
        try (OPCPackage pkg = OPCPackage.open(new ByteArrayInputStream(content))) {
            var reader = new XSSFReader(pkg);
            var strings = new ReadOnlySharedStringsTable(pkg);
            var sheets = reader.getSheetsData();
            if (!sheets.hasNext()) throw new BadRequestException("El libro de Excel no tiene hojas");
            try (InputStream sheet = sheets.next()) {
                var parser = XMLHelper.newXMLReader();
                parser.setContentHandler(new XSSFSheetXMLHandler(
                        reader.getStylesTable(), null, strings, new XlsxRows(out), new IsoDateFormatter(), false));
                parser.parse(new InputSource(sheet));
            }
        } catch (org.apache.poi.openxml4j.exceptions.OpenXML4JException
                 | javax.xml.parsers.ParserConfigurationException e) {
            throw new BadRequestException("El archivo no es un Excel válido");
        }
    }

    /** XLS (Excel 97-2003): máximo 65.536 filas, se puede abrir completo. */
    private static void readXls(byte[] content, Collector out) throws IOException {
        try (var workbook = new HSSFWorkbook(new ByteArrayInputStream(content))) {
            if (workbook.getNumberOfSheets() == 0) throw new BadRequestException("El libro de Excel no tiene hojas");
            var formatter = new IsoDateFormatter();
            var evaluator = workbook.getCreationHelper().createFormulaEvaluator();
            for (Row row : workbook.getSheetAt(0)) {
                var values = new ArrayList<String>();
                for (int c = 0; c < Math.max(row.getLastCellNum(), 0); c++) {
                    Cell cell = row.getCell(c);
                    if (cell == null) values.add("");
                    else if (cell.getCellType() == CellType.NUMERIC && DateUtil.isCellDateFormatted(cell))
                        values.add(IsoDateFormatter.iso(cell.getLocalDateTimeCellValue()));
                    else values.add(formatter.formatCellValue(cell, evaluator));
                }
                out.row(values);
            }
        }
    }

    /** Arma las filas del XLSX: las celdas vacías no vienen en el XML, se ubican por su referencia (C7 → columna 2). */
    private record XlsxRows(Collector out, List<String> current) implements SheetContentsHandler {
        XlsxRows(Collector out) {
            this(out, new ArrayList<>());
        }

        @Override
        public void startRow(int rowNum) {
            current.clear();
        }

        @Override
        public void endRow(int rowNum) {
            out.row(new ArrayList<>(current));
        }

        @Override
        public void cell(String reference, String value, XSSFComment comment) {
            int column = reference == null ? current.size() : new CellReference(reference).getCol();
            if (column >= MAX_COLUMNS) return;
            while (current.size() < column) current.add("");
            current.add(value == null ? "" : value);
        }
    }

    /** Formateador de Excel que escribe las fechas en ISO en vez de usar el formato de la celda (p. ej. "3/15/90"). */
    static final class IsoDateFormatter extends DataFormatter {
        IsoDateFormatter() {
            super(Locale.ROOT);
        }

        @Override
        public String formatRawCellContents(double value, int formatIndex, String formatString, boolean use1904) {
            if (DateUtil.isADateFormat(formatIndex, formatString) && DateUtil.isValidExcelDate(value)) {
                return iso(DateUtil.getLocalDateTime(value, use1904));
            }
            return super.formatRawCellContents(value, formatIndex, formatString, use1904);
        }

        static String iso(LocalDateTime value) {
            if (value.toLocalTime().equals(LocalTime.MIDNIGHT)) return value.toLocalDate().toString();
            return value.truncatedTo(ChronoUnit.MINUTES).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
        }
    }

    // ---------- Resultado ----------

    /** Acumula filas: salta las vacías, toma la primera como encabezados y corta al llegar al máximo. */
    private static final class Collector {

        /** Señal para detener la lectura (el parser SAX no tiene otra forma de parar). */
        static final class Full extends RuntimeException {
            Full() {
                super(null, null, false, false);
            }
        }

        private List<String> headers;
        private final List<List<String>> rows = new ArrayList<>();
        private boolean truncated;

        void row(List<String> raw) {
            var values = new ArrayList<String>(Math.min(raw.size(), MAX_COLUMNS));
            for (int i = 0; i < raw.size() && i < MAX_COLUMNS; i++) {
                String v = raw.get(i) == null ? "" : raw.get(i).strip();
                values.add(v.length() > MAX_CELL ? v.substring(0, MAX_CELL) : v);
            }
            while (!values.isEmpty() && values.getLast().isEmpty()) values.removeLast();
            if (values.isEmpty()) return;
            if (headers == null) {
                headers = values;
                return;
            }
            if (rows.size() >= MAX_ROWS) {
                truncated = true;
                throw new Full();
            }
            rows.add(values);
        }

        SheetResponse result(String fileName) {
            if (headers == null) throw new BadRequestException("El archivo no tiene datos");
            int width = Math.max(headers.size(), rows.stream().mapToInt(List::size).max().orElse(0));
            var names = new ArrayList<String>(width);
            for (int i = 0; i < width; i++) {
                String h = i < headers.size() ? headers.get(i) : "";
                names.add(h.isEmpty() || names.contains(h) ? "Columna " + (i + 1) : h);
            }
            var padded = rows.stream().map(r -> {
                var copy = new ArrayList<>(r);
                while (copy.size() < width) copy.add("");
                return (List<String>) copy;
            }).toList();
            return new SheetResponse(fileName, names, padded, truncated);
        }
    }

    private static boolean startsWith(byte[] content, int... magic) {
        if (content.length < magic.length) return false;
        for (int i = 0; i < magic.length; i++) if ((content[i] & 0xFF) != magic[i]) return false;
        return true;
    }
}
