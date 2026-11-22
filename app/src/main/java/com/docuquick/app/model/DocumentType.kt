package com.docuquick.app.model

import com.docuquick.app.R
import java.io.InputStream

enum class DocumentType(
    val categoryName: String,
    val iconRes: Int,
    val badgeColorRes: Int
) {
    PDF("PDF", R.drawable.ic_doc_pdf, R.color.badge_pdf),
    WORD("Word", R.drawable.ic_doc_word, R.color.badge_word),
    EXCEL("Excel", R.drawable.ic_doc_excel, R.color.badge_excel),
    PPT("Presentation", R.drawable.ic_doc_ppt, R.color.badge_code),
    MARKDOWN("Markdown", R.drawable.ic_doc_text, R.color.badge_markdown),
    TEXT("Text", R.drawable.ic_doc_text, R.color.badge_markdown),
    EPUB("EPUB", R.drawable.ic_doc_epub, R.color.badge_epub),
    CODE("Code", R.drawable.ic_doc_code, R.color.badge_code),
    IMAGE("Image", R.drawable.ic_doc_image, R.color.badge_image),
    UNSUPPORTED("Unsupported", R.drawable.ic_folder_open, R.color.badge_pdf),
    UNKNOWN("Document", R.drawable.ic_folder_open, R.color.accent_cyan);

    companion object {
        fun fromFileNameAndMime(fileName: String?, mimeType: String?): DocumentType {
            val extension = fileName?.substringAfterLast('.', "")?.lowercase() ?: ""
            val mime = mimeType?.lowercase() ?: ""

            // Explicitly detect unsupported formats like videos, audio, executables
            val isVideo = extension in listOf("mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "3gp", "m4v") ||
                    mime.startsWith("video/")
            val isAudio = extension in listOf("mp3", "wav", "aac", "m4a", "flac", "ogg", "wma", "opus") ||
                    mime.startsWith("audio/")
            val isExecutable = extension in listOf("exe", "apk", "deb", "iso", "dmg", "bin", "so", "dex", "class")

            if (isVideo || isAudio || isExecutable) {
                return UNSUPPORTED
            }

            return when {
                extension == "pdf" || mime == "application/pdf" -> PDF

                extension in listOf("docx", "doc", "dot", "dotx", "docm", "odt", "ott", "fodt", "rtf") ||
                        mime.contains("wordprocessingml") ||
                        mime.contains("msword") ||
                        mime.contains("opendocument.text") ||
                        mime.contains("rtf") -> WORD

                extension in listOf("xlsx", "xls", "csv", "tsv", "ods", "xlsm", "xlsb", "xltx") ||
                        mime.contains("spreadsheetml") ||
                        mime.contains("ms-excel") ||
                        mime.contains("opendocument.spreadsheet") ||
                        mime.contains("csv") -> EXCEL

                extension in listOf("pptx", "ppt", "pps", "ppsx", "pptm", "potx", "pot") ||
                        mime.contains("presentationml") ||
                        mime.contains("ms-powerpoint") -> PPT

                extension in listOf("md", "markdown") ||
                        mime.contains("markdown") -> MARKDOWN

                extension == "epub" ||
                        mime.contains("epub") -> EPUB

                extension in listOf("txt", "log") ||
                        mime.startsWith("text/plain") -> TEXT

                extension in listOf(
                    "json", "xml", "html", "htm", "css", "js", "ts", "py",
                    "java", "kt", "c", "cpp", "h", "hpp", "cs", "php",
                    "rb", "go", "rs", "swift", "sql", "sh", "yaml", "yml"
                ) || mime.contains("json") || mime.contains("xml") ||
                        mime.startsWith("text/x-") || mime.startsWith("application/x-") -> CODE

                extension in listOf("png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "tiff") ||
                        mime.startsWith("image/") -> IMAGE

                else -> UNKNOWN
            }
        }

        /**
         * Fallback detection by inspecting magic bytes of the stream.
         * Detects documents and catches unsupported videos/audio that were disguised as octet-stream.
         */
        fun detectFromStream(stream: InputStream): DocumentType {
            return try {
                val header = ByteArray(16)
                val read = stream.read(header)
                if (read < 4) return TEXT

                // 1. PDF (%PDF-)
                if (header[0] == 0x25.toByte() && header[1] == 0x50.toByte() &&
                    header[2] == 0x44.toByte() && header[3] == 0x46.toByte()
                ) {
                    return PDF
                }

                // 2. PNG (\x89PNG)
                if (header[0] == 0x89.toByte() && header[1] == 0x50.toByte() &&
                    header[2] == 0x4E.toByte() && header[3] == 0x47.toByte()
                ) {
                    return IMAGE
                }

                // 3. JPEG (\xFF\xD8\xFF)
                if (header[0] == 0xFF.toByte() && header[1] == 0xD8.toByte() && header[2] == 0xFF.toByte()) {
                    return IMAGE
                }

                // 4. GIF (GIF8)
                if (header[0] == 'G'.code.toByte() && header[1] == 'I'.code.toByte() &&
                    header[2] == 'F'.code.toByte() && header[3] == '8'.code.toByte()
                ) {
                    return IMAGE
                }

                // 5. MP4 / MOV (ftyp at offset 4..7)
                if (read >= 8 && header[4] == 'f'.code.toByte() && header[5] == 't'.code.toByte() &&
                    header[6] == 'y'.code.toByte() && header[7] == 'p'.code.toByte()
                ) {
                    return UNSUPPORTED
                }

                // 6. MP3 (ID3)
                if (header[0] == 'I'.code.toByte() && header[1] == 'D'.code.toByte() && header[2] == '3'.code.toByte()) {
                    return UNSUPPORTED
                }

                // 7. Matroska / MKV / WebM (\x1A\x45\xDF\xA3)
                if (header[0] == 0x1A.toByte() && header[1] == 0x45.toByte() &&
                    header[2] == 0xDF.toByte() && header[3] == 0xA3.toByte()
                ) {
                    return UNSUPPORTED
                }

                // 8. ZIP Archive (PK\x03\x04) -> DOCX, XLSX, or EPUB
                if (header[0] == 0x50.toByte() && header[1] == 0x4B.toByte() &&
                    header[2] == 0x03.toByte() && header[3] == 0x04.toByte()
                ) {
                    return WORD
                }

                TEXT
            } catch (e: Exception) {
                TEXT
            }
        }
    }
}
