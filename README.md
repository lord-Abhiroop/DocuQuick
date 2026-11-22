# DocuQuick: Ultra-Fast Android All-Document Viewer

**DocuQuick** is an ultra-fast, minimalist, and battery-efficient all-document viewer designed specifically for Android smartphones. Built with modern Kotlin and Android native APIs, the entire application compiles to **under 3.5 MB (3.2 MB signed APK)** while supporting opening every major document type without bloated third-party engines.

---

## 📸 Screenshots

| Clean Empty State | Recents & Cache Management | Category Filtering |
|:---:|:---:|:---:|
| <img src="screenshots/empty_state.jpg" width="260" alt="Clean Empty State" /> | <img src="screenshots/recent_documents.jpg" width="260" alt="Recent Documents Dashboard" /> | <img src="screenshots/category_filter.jpg" width="260" alt="Category Filter" /> |

---

## 🚀 Key Features & Highlights

- **Ultra-Lean Size (3.2 MB APK)**:
  - Zero heavy external dependencies (no Apache POI, no bloated binary renderers).
  - Uses native Android hardware-accelerated APIs (`PdfRenderer`, `XmlPullParser`, `ZipInputStream`, `BitmapFactory`, and hardware-accelerated `WebView`).
- **Universal Hardware-Adaptive Sharpness**:
  - Dynamically queries physical display metrics at runtime (`displayMetrics.density` & `widthPixels`) to render 1:1 hardware pixel-perfect text on any screen (720p, 1080p FHD+, 1440p QHD+, AMOLED, and foldables/tablets).
- **Password-Protected Document Unlock**:
  - Automatically intercepts encrypted documents (Aadhaar cards, bank e-statements, payslips) and unlocks them with a floating password unlock bar and AES-256 decryption.
- **One-Tap Cache & History Cleanup**:
  - Dedicated trash button instantly clears recents history, WebView storage, and temp document caches with a strict 20 MB / 12-file automatic LRU cap.
- **Zero-Latency Launch & Clean Typography**:
  - Opens documents instantly without splash screens, telemetry, or network latency.
  - Specially designed reading typography: optimal line leading (`1.45x`), generous margins (`18dp`), clear paragraph hierarchy, and high-contrast text.
- **Privacy First (100% Offline)**:
  - Requires **zero internet permissions**. Documents never leave your phone.
- **Universal Android Integration**:
  - Registered intent filters for all document MIME types and extensions.
  - Seamlessly handles *"Open with..."* and *"Share to..."* from WhatsApp, Telegram, Gmail, Chrome, and Android Files.
- **Adaptive Reading Themes**:
  - Light mode, Dark mode, **Pure AMOLED Black** (saves battery on OLED displays), and **Warm Sepia** eye-care mode.
- **In-Document Search**:
  - Real-time text search with match highlighting, match counter, and Up/Down navigation.
- **Dynamic Text Sizing**:
  - One-tap font scaling from 85% to 150% with automatic preference memory.

---

## 📂 Supported Document Formats

| Category | Formats | Implementation Engine |
|---|---|---|
| **PDF** | `.pdf` | Native Android `PdfRenderer` + asynchronous tile cache (60 FPS smooth scrolling) |
| **Word** | `.docx`, `.doc` | Streaming XML parser (`XmlPullParser`) extracting headings, bold, italic, underline, lists, and tables |
| **Spreadsheets** | `.xlsx`, `.xls`, `.csv`, `.tsv` | High-speed XML string table parser + interactive sticky header table view |
| **Text & Docs** | `.txt`, `.rtf`, `.log` | Selectable native text engine with word count & reading time stats |
| **Markdown** | `.md`, `.markdown` | Custom Markdown span parser (headings, blockquotes, code blocks, lists, dividers) |
| **E-Books** | `.epub` | Lightweight EPUB container extractor + hardware-accelerated responsive reader |
| **Code & Data** | `.json`, `.xml`, `.py`, `.js`, `.kt`, `.java`, `.cpp`, `.sql`, `.yaml`, `.html`, `.css` | Syntax colorizer with line numbering and auto-indented JSON formatting |
| **Images** | `.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`, `.gif`, `.bmp` | Subsampled `BitmapFactory` memory-safe decoding with image dimensions pill |

---

## 🛠️ How to Build the APK

### Option 1: Automatic Build via GitHub Actions (Recommended)
This repository includes a pre-configured GitHub Actions workflow: [build-apk.yml](.github/workflows/build-apk.yml).
1. Push this project to GitHub.
2. Go to the **Actions** tab on your GitHub repository.
3. The workflow builds both **Debug** and **Release APKs** automatically in ~90 seconds.
4. Download the ready-to-install `.apk` artifact directly to your phone!

### Option 2: Build Locally with Gradle
If you have JDK 17+ installed on your computer:
```bash
# Clone or navigate to the directory
cd docuquick-android

# Build Debug APK:
./gradlew assembleDebug

# Build Release APK (Minified & Optimized under 2.5 MB):
./gradlew assembleRelease
```
The output APK will be generated at:
- `app/build/outputs/apk/release/app-release-unsigned.apk`
- `app/build/outputs/apk/debug/app-debug.apk`

---

## 📱 Project Architecture

```
docuquick-android/
├── .github/workflows/build-apk.yml    # CI/CD automated APK compiler
├── app/
│   ├── build.gradle.kts               # Android build configuration (MinSdk 24, TargetSdk 35)
│   ├── proguard-rules.pro             # R8 bytecode optimization rules
│   └── src/main/
│       ├── AndroidManifest.xml        # System intent filters for all file types
│       ├── java/com/docuquick/app/
│       │   ├── DocuQuickApp.kt        # App lifecycle & theme manager
│       │   ├── MainActivity.kt        # Quick Launcher & Recents Dashboard
│       │   ├── ViewerActivity.kt      # Main Reader & View Orchestrator
│       │   ├── model/
│       │   │   ├── DocumentType.kt    # File detection & category enum
│       │   │   └── RecentFile.kt      # Recents model
│       │   ├── parser/
│       │   │   ├── DocxParser.kt      # Zero-dependency DOCX parser
│       │   │   ├── ExcelParser.kt     # XLSX & CSV parser
│       │   │   ├── MarkdownParser.kt  # Native Markdown engine
│       │   │   ├── EpubParser.kt      # EPUB book extractor
│       │   │   └── CodeHighlighter.kt # Syntax highlighting & line numbers
│       │   ├── ui/
│       │   │   ├── PdfAdapter.kt      # Recycled page bitmap renderer
│       │   │   └── RecentFilesAdapter.kt
│       │   └── util/
│       │       ├── FileUtils.kt       # Size formatting & URI resolvers
│       │       └── PreferencesManager.kt
│       └── res/                       # Vector icons, Material 3 layouts & themes
├── build.gradle.kts
└── settings.gradle.kts
```
