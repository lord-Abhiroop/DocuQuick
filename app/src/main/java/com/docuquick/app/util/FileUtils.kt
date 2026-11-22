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

    fun pruneCache(context: Context, maxSizeBytes: Long = 20 * 1024 * 1024, maxFiles: Int = 12) {
        try {
            // 1. Reclaim any legacy storage in filesDir/documents
            val legacyDir = File(context.filesDir, "documents")
            if (legacyDir.exists()) {
                legacyDir.deleteRecursively()
            }

            // 2. Clean up temporary render spool files in cacheDir (older than 2 mins)
            context.cacheDir.listFiles()?.forEach { file ->
                if (file.isFile && (file.name.startsWith("pdf_") || file.name.startsWith("temp_") || file.name.startsWith("doc_"))) {
                    if (System.currentTimeMillis() - file.lastModified() > 2 * 60 * 1000) {
                        file.delete()
                    }
                }
            }

            // 3. Clear Chromium WebView disk cache
            val webviewCache = File(context.cacheDir, "WebView")
            if (webviewCache.exists()) {
                webviewCache.deleteRecursively()
            }

            // 4. Enforce LRU cap on cacheDir/documents (20 MB / 12 files preserved)
            val docsDir = File(context.cacheDir, "documents")
            if (docsDir.exists()) {
                val files = docsDir.listFiles() ?: return
                val sorted = files.sortedByDescending { it.lastModified() }
                var totalSize = 0L

                sorted.forEachIndexed { index, file ->
                    totalSize += file.length()
                    if (index >= maxFiles || totalSize > maxSizeBytes) {
                        file.delete()
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun cacheDocumentLocally(context: Context, uri: Uri, originalName: String): Uri {
        return try {
            pruneCache(context)

            val docsDir = File(context.cacheDir, "documents")
            if (!docsDir.exists()) docsDir.mkdirs()

            val safeName = originalName.replace(Regex("[^a-zA-Z0-9._-]"), "_").ifEmpty { "document" }
            val targetFile = File(docsDir, safeName)

            val fileProviderUri = try {
                androidx.core.content.FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    targetFile
                )
            } catch (e: Exception) {
                null
            }

            // If already cached and valid, refresh last modified and return it directly
            if (uri == fileProviderUri || (uri.scheme == "file" && uri.path == targetFile.absolutePath && targetFile.exists())) {
                targetFile.setLastModified(System.currentTimeMillis())
                return fileProviderUri ?: uri
            }

            context.contentResolver.openInputStream(uri)?.use { input ->
                FileOutputStream(targetFile).use { output ->
                    input.copyTo(output)
                }
            }

            if (targetFile.exists() && targetFile.length() > 0) {
                targetFile.setLastModified(System.currentTimeMillis())
                fileProviderUri ?: androidx.core.content.FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    targetFile
                )
            } else {
                uri
            }
        } catch (e: Exception) {
            e.printStackTrace()
            uri
        }
    }

    fun clearAllHistoryAndCache(context: Context) {
        try {
            // 1. Delete all cached documents
            val docsDir = File(context.cacheDir, "documents")
            if (docsDir.exists()) {
                docsDir.deleteRecursively()
            }
            // 2. Delete legacy documents
            val legacyDir = File(context.filesDir, "documents")
            if (legacyDir.exists()) {
                legacyDir.deleteRecursively()
            }
            // 3. Delete all temp files and WebView cache in cacheDir
            context.cacheDir.listFiles()?.forEach { file ->
                if (file.isFile) file.delete()
                else if (file.name == "WebView" || file.name == "documents") file.deleteRecursively()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun isUriAccessible(context: Context, uri: Uri): Boolean {
        return try {
            if (uri.scheme == "file") {
                val f = File(uri.path ?: "")
                f.exists() && f.canRead()
            } else if (uri.authority == "${context.packageName}.fileprovider") {
                val safeName = uri.lastPathSegment ?: return false
                val f = File(context.cacheDir, "documents/$safeName")
                f.exists() && f.length() > 0
            } else {
                context.contentResolver.openInputStream(uri)?.use { true } ?: false
            }
        } catch (e: Exception) {
            false
        }
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
