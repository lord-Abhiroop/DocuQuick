package com.docuquick.app.util

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.text.format.DateUtils
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.text.DecimalFormat

object FileUtils {

    fun formatFileSize(bytes: Long): String {
        if (bytes <= 0) return "0 B"
        val units = arrayOf("B", "KB", "MB", "GB")
        val digitGroups = (Math.log10(bytes.toDouble()) / Math.log10(1024.0)).toInt()
        val index = digitGroups.coerceIn(0, units.size - 1)
        val value = bytes / Math.pow(1024.0, index.toDouble())
        return DecimalFormat("#,##0.#").format(value) + " " + units[index]
    }

    fun getFileMetadata(context: Context, uri: Uri): Pair<String, Long> {
        var name = "Document"
        var size = 0L

        if (uri.scheme == "content") {
            try {
                context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                    val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                    if (cursor.moveToFirst()) {
                        if (nameIndex != -1) {
                            cursor.getString(nameIndex)?.let { name = it }
                        }
                        if (sizeIndex != -1) {
                            size = cursor.getLong(sizeIndex)
                        }
                    }
                }
            } catch (e: Exception) {
                // Fallback to last path segment
                uri.lastPathSegment?.let { name = it }
            }
        } else if (uri.scheme == "file") {
            uri.path?.let { path ->
                val file = File(path)
                name = file.name
                size = file.length()
            }
        }

        return Pair(name, size)
    }

    fun copyUriToTempFile(context: Context, uri: Uri, prefix: String = "doc_", suffix: String = ".tmp"): File {
        val tempFile = File.createTempFile(prefix, suffix, context.cacheDir)
        tempFile.deleteOnExit()

        context.contentResolver.openInputStream(uri)?.use { input ->
            FileOutputStream(tempFile).use { output ->
                input.copyTo(output)
            }
        } ?: throw IllegalStateException("Unable to open input stream for URI: $uri")

        return tempFile
    }

    fun readStringFromUri(context: Context, uri: Uri): String {
        return context.contentResolver.openInputStream(uri)?.use { input ->
            input.bufferedReader(Charsets.UTF_8).use { it.readText() }
        } ?: ""
    }

    fun formatLastOpened(timeMs: Long): String {
        return DateUtils.getRelativeTimeSpanString(
            timeMs,
            System.currentTimeMillis(),
            DateUtils.MINUTE_IN_MILLIS,
            DateUtils.FORMAT_ABBREV_RELATIVE
        ).toString()
    }
}
