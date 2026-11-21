package com.docuquick.app.model

import com.docuquick.app.R

enum class DocumentType(
    val categoryName: String,
    val iconRes: Int,
    val badgeColorRes: Int
) {
    PDF("PDF", R.drawable.ic_doc_pdf, R.color.badge_pdf),
    WORD("Word", R.drawable.ic_doc_word, R.color.badge_word),
    EXCEL("Excel", R.drawable.ic_doc_excel, R.color.badge_excel),
    MARKDOWN("Markdown", R.drawable.ic_doc_text, R.color.badge_markdown),
    TEXT("Text", R.drawable.ic_doc_text, R.color.badge_markdown),
    EPUB("EPUB", R.drawable.ic_doc_epub, R.color.badge_epub),
    CODE("Code", R.drawable.ic_doc_code, R.color.badge_code),
    IMAGE("Image", R.drawable.ic_doc_image, R.color.badge_image),
    UNKNOWN("Document", R.drawable.ic_folder_open, R.color.accent_cyan);

    companion object {
        fun fromFileNameAndMime(fileName: String?, mimeType: String?): DocumentType {
            val extension = fileName?.substringAfterLast('.', "")?.lowercase() ?: ""
            val mime = mimeType?.lowercase() ?: ""

            return when {
                extension == "pdf" || mime == "application/pdf" -> PDF

                extension in listOf("docx", "doc") ||
                        mime.contains("wordprocessingml") ||
                        mime.contains("msword") -> WORD

                extension in listOf("xlsx", "xls", "csv", "tsv") ||
                        mime.contains("spreadsheetml") ||
                        mime.contains("ms-excel") ||
                        mime.contains("csv") -> EXCEL

                extension in listOf("md", "markdown") ||
                        mime.contains("markdown") -> MARKDOWN

                extension == "epub" ||
                        mime.contains("epub") -> EPUB

                extension in listOf("txt", "log", "rtf") ||
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
    }
}
