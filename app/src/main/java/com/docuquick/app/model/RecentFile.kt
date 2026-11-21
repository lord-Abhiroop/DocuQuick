package com.docuquick.app.model

data class RecentFile(
    val uriString: String,
    val name: String,
    val sizeBytes: Long,
    val type: DocumentType,
    val lastOpened: Long = System.currentTimeMillis()
)
