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

        val trimmed = current.take(MAX_RECENTS)
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
                val type = try {
                    DocumentType.valueOf(obj.getString("type"))
                } catch (e: Exception) {
                    DocumentType.UNKNOWN
                }
                list.add(
                    RecentFile(
                        uriString = obj.getString("uri"),
                        name = obj.getString("name"),
                        sizeBytes = obj.optLong("size", 0L),
                        type = type,
                        lastOpened = obj.optLong("time", 0L)
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

    var textSizeScale: Float
        get() = prefs.getFloat(KEY_TEXT_SIZE_SCALE, 1.0f)
        set(value) = prefs.edit().putFloat(KEY_TEXT_SIZE_SCALE, value).apply()

    var themeMode: Int
        get() = prefs.getInt(KEY_THEME_MODE, 0)
        set(value) = prefs.edit().putInt(KEY_THEME_MODE, value).apply()
}
