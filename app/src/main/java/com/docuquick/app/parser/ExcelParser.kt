package com.docuquick.app.parser

import android.util.Xml
import org.xmlpull.v1.XmlPullParser
import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.util.zip.ZipInputStream

data class SheetData(
    val title: String,
    val headers: List<String>,
    val rows: List<List<String>>
)

object ExcelParser {

    /**
     * Parses an XLSX file from an InputStream.
     * Extracts shared strings and the primary worksheet.
     */
    fun parseXlsx(inputStream: InputStream): SheetData {
        val sharedStrings = mutableListOf<String>()
        val rawRows = mutableListOf<List<String>>()

        // Read all zip entries
        val zip = ZipInputStream(inputStream)
        var entry = zip.nextEntry
        val entriesData = mutableMapOf<String, ByteArray>()

        while (entry != null) {
            if (entry.name == "xl/sharedStrings.xml" || entry.name == "xl/worksheets/sheet1.xml") {
                entriesData[entry.name] = zip.readBytes()
            }
            entry = zip.nextEntry
        }
        zip.close()

        // 1. Parse shared strings if present
        entriesData["xl/sharedStrings.xml"]?.let { bytes ->
            val parser = Xml.newPullParser()
            parser.setInput(bytes.inputStream(), "UTF-8")
            var eventType = parser.eventType
            var inText = false
            var currentStr = StringBuilder()

            while (eventType != XmlPullParser.END_DOCUMENT) {
                when (eventType) {
                    XmlPullParser.START_TAG -> {
                        if (parser.name == "t") inText = true
                    }
                    XmlPullParser.TEXT -> {
                        if (inText) currentStr.append(parser.text)
                    }
                    XmlPullParser.END_TAG -> {
                        if (parser.name == "t") inText = false
                        else if (parser.name == "si") {
                            sharedStrings.add(currentStr.toString())
                            currentStr.clear()
                        }
                    }
                }
                eventType = parser.next()
            }
        }

        // 2. Parse sheet1.xml
        entriesData["xl/worksheets/sheet1.xml"]?.let { bytes ->
            val parser = Xml.newPullParser()
            parser.setInput(bytes.inputStream(), "UTF-8")
            var eventType = parser.eventType
            val currentRow = mutableListOf<String>()
            var isStringRef = false
            var cellValue = ""

            while (eventType != XmlPullParser.END_DOCUMENT) {
                when (eventType) {
                    XmlPullParser.START_TAG -> {
                        when (parser.name) {
                            "row" -> currentRow.clear()
                            "c" -> {
                                val type = parser.getAttributeValue(null, "t")
                                isStringRef = (type == "s")
                                cellValue = ""
                            }
                            "v" -> {
                                cellValue = parser.nextText()
                            }
                        }
                    }
                    XmlPullParser.END_TAG -> {
                        when (parser.name) {
                            "c" -> {
                                val resolved = if (isStringRef) {
                                    val idx = cellValue.toIntOrNull() ?: -1
                                    if (idx in 0 until sharedStrings.size) sharedStrings[idx] else cellValue
                                } else {
                                    cellValue
                                }
                                currentRow.add(resolved)
                            }
                            "row" -> {
                                if (currentRow.isNotEmpty()) {
                                    rawRows.add(ArrayList(currentRow))
                                }
                            }
                        }
                    }
                }
                eventType = parser.next()
            }
        }

        if (rawRows.isEmpty()) {
            return SheetData("Sheet 1", listOf("A", "B", "C"), emptyList())
        }

        val headers = rawRows.first()
        val dataRows = if (rawRows.size > 1) rawRows.subList(1, rawRows.size) else emptyList()

        return SheetData("Sheet 1", headers, dataRows)
    }

    /**
     * Parses CSV or TSV data with RFC-4180 quote support.
     */
    fun parseCsv(inputStream: InputStream): SheetData {
        val reader = BufferedReader(InputStreamReader(inputStream))
        val rawRows = mutableListOf<List<String>>()

        var line = reader.readLine()
        // Determine delimiter by counting commas vs tabs vs semicolons
        var delimiter = ','
        line?.let { firstLine ->
            val commas = firstLine.count { it == ',' }
            val tabs = firstLine.count { it == '\t' }
            val semis = firstLine.count { it == ';' }
            if (tabs > commas && tabs > semis) delimiter = '\t'
            else if (semis > commas && semis > tabs) delimiter = ';'
        }

        while (line != null) {
            val cells = parseCsvLine(line, delimiter)
            if (cells.isNotEmpty()) rawRows.add(cells)
            line = reader.readLine()
        }

        if (rawRows.isEmpty()) {
            return SheetData("CSV Document", emptyList(), emptyList())
        }

        val headers = rawRows.first()
        val dataRows = if (rawRows.size > 1) rawRows.subList(1, rawRows.size) else emptyList()
        return SheetData("CSV Document", headers, dataRows)
    }

    private fun parseCsvLine(line: String, delimiter: Char): List<String> {
        val tokens = mutableListOf<String>()
        val sb = StringBuilder()
        var inQuotes = false

        for (ch in line) {
            if (ch == '\"') {
                inQuotes = !inQuotes
            } else if (ch == delimiter && !inQuotes) {
                tokens.add(sb.toString().trim())
                sb.clear()
            } else {
                sb.append(ch)
            }
        }
        tokens.add(sb.toString().trim())
        return tokens
    }
}
