package com.docuquick.app

import android.app.Application
import androidx.appcompat.app.AppCompatDelegate
import com.docuquick.app.util.PreferencesManager

class DocuQuickApp : Application() {

    lateinit var prefs: PreferencesManager
        private set

    override fun onCreate() {
        super.onCreate()
        prefs = PreferencesManager(this)

        // Apply saved theme mode
        when (prefs.themeMode) {
            1 -> AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO)
            2, 3 -> AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_YES)
            else -> AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM)
        }
    }
}
