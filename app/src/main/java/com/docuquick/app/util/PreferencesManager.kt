package com.docuquick.app.util

import android.content.Context
import android.content.SharedPreferences
import com.docuquick.app.model.DocumentType
import com.docuquick.app.model.RecentFile
import org.json.JSONArray
import org.json.JSONObject

class PreferencesManager(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("docuquick_prefs", Context.MODE_PRIVATE)

    companion object {
        private const val KEY_RECENTS = "key_recent_files"
        private const val KEY_TEXT_SIZE_SCALE = "key_text_size_scale"
        private const val KEY_THEME_MODE = "key_theme_mode" // 0: System/Auto, 1: Light, 2: Dark, 3: AMOLED
        private const val MAX_RECENTS = 50
    }

    fun addRecentFile(file: RecentFile) {
        val current = getRecentFiles().toMutableList()
        current.removeAll { it.uriString == file.uriString }
        current.add(0, file)
        saveRecentFiles(current)
    }

    fun saveRecentFiles(files: List<RecentFile>) {
        val trimmed = files.take(MAX_RECENTS)
        val array = JSONArray()
        trimmed.forEach { item ->
            val obj = JSONObject().apply {
                put("uri", item.uriString)
                put("name", item.name)
                put("size", item.sizeBytes)
                put("type", item.type.name)
                put("time", item.lastOpened)
            }
            array.put(obj)
        }

        prefs.edit().putString(KEY_RECENTS, array.toString()).apply()
    }

    fun getRecentFiles(): List<RecentFile> {
        val json = prefs.getString(KEY_RECENTS, null) ?: return emptyList()
        val list = mutableListOf<RecentFile>()
        try {
            val array = JSONArray(json)
            for (i in 0 until array.length()) {
                val obj = array.getJSONObject(i)
                val rawName = obj.optString("name", "Document")
                val rawType = obj.optString("type", "")
                val type = try {
                    val parsed = DocumentType.valueOf(rawType)
                    if (parsed == DocumentType.UNKNOWN) {
                        DocumentType.fromFileNameAndMime(rawName, null)
                    } else {
                        parsed
                    }
                } catch (e: Exception) {
                    DocumentType.fromFileNameAndMime(rawName, null)
                }
                val savedTime = obj.optLong("time", 0L)
                val finalTime = if (savedTime > 0L) savedTime else System.currentTimeMillis()
                list.add(
                    RecentFile(
                        uriString = obj.getString("uri"),
                        name = rawName,
                        sizeBytes = obj.optLong("size", 0L),
                        type = type,
                        lastOpened = finalTime
                    )
                )
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return list
    }

    fun clearRecents() {
        prefs.edit().remove(KEY_RECENTS).apply()
    }

    fun getDocumentPosition(uriString: String): Int {
        return prefs.getInt("pos_${uriString.hashCode()}", 1)
    }

    fun saveDocumentPosition(uriString: String, page: Int) {
        prefs.edit().putInt("pos_${uriString.hashCode()}", page).apply()
    }

    fun getDocumentScrollY(uriString: String): Int {
        return prefs.getInt("scroll_${uriString.hashCode()}", 0)
    }

    fun saveDocumentScrollY(uriString: String, y: Int) {
        prefs.edit().putInt("scroll_${uriString.hashCode()}", y).apply()
    }

    var textSizeScale: Float
        get() = prefs.getFloat(KEY_TEXT_SIZE_SCALE, 1.0f)
        set(value) = prefs.edit().putFloat(KEY_TEXT_SIZE_SCALE, value).apply()

    var themeMode: Int
        get() = prefs.getInt(KEY_THEME_MODE, 0)
        set(value) = prefs.edit().putInt(KEY_THEME_MODE, value).apply()
}
