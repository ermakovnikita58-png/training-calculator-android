package ru.trainingcalculator.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import androidx.webkit.JavaScriptReplyProxy
import org.json.JSONObject
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import java.util.concurrent.Executors
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import android.graphics.Color
import android.widget.FrameLayout
import androidx.core.view.WindowCompat

class MainActivity : ComponentActivity() {
    private var navigationReady = false
    private var internalBack = true
    private var backPending = false
    private var imeVisible = false
    private lateinit var backCallback: OnBackPressedCallback
    private fun updateBackCallback() {
        if (::backCallback.isInitialized) backCallback.isEnabled = !imeVisible && (!navigationReady || internalBack || hasDocumentHistory())
    }
    // pushState entries belong to the JS coordinator, not document navigation.
    private fun hasDocumentHistory(): Boolean {
        if (!::webView.isInitialized) return false
        val history = webView.copyBackForwardList()
        return history.currentIndex > 0 && history.getItemAtIndex(history.currentIndex - 1)?.url?.substringBefore('#') != webView.url?.substringBefore('#')
    }
    private lateinit var webView: WebView
    private val assetHost = "https://appassets.androidplatform.net"
    private lateinit var assetLoader: WebViewAssetLoader
    private val storageWorker = Executors.newSingleThreadExecutor()
    private var chooserCallback: ValueCallback<Array<Uri>>? = null
    private var pendingBytes: ByteArray? = null
    private var pendingBackupRequest: Int? = null
    private var pendingMime: String? = null
    private val diagnostics by lazy { ForgeDiagnostics(applicationContext) }
    private var notificationReply: JavaScriptReplyProxy? = null
    private val notifications = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestPermission()) { granted ->
        RestReminder.toggle(this, granted)
        notificationReply?.let(::reportPreferences)
        notificationReply = null
    }
    private val vault by lazy { CloudSessionVault(applicationContext) }
    private var healthReply: JavaScriptReplyProxy? = null
    private var healthGeneration = 0
    private val healthPreferences by lazy { getSharedPreferences("forge_health", MODE_PRIVATE) }
    private val healthPermission = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        val reply = healthReply
        healthReply = null
        if (reply != null && android.os.Build.VERSION.SDK_INT >= 34 && granted.values.any { it }) readHealth(reply)
        else if (reply != null) post(reply, JSONObject().put("kind", "health").put("ok", false))
    }
    private var scannerOpen = false
    private val scanner = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()) { result ->
        scannerOpen = false
        if (result.resultCode == Activity.RESULT_OK && ::webView.isInitialized && !isDestroyed) {
            val code = result.data?.getStringExtra(BarcodeScannerActivity.EXTRA_CODE).orEmpty()
            val compressed = result.data?.getBooleanExtra(BarcodeScannerActivity.EXTRA_COMPRESSED, false) == true
            if (RetailBarcode.valid(code, compressed)) {
                val format = if (compressed) JSONObject.quote("upc_e") else "undefined"
                webView.evaluateJavascript("window.ForgeBarcode?.scanned(${JSONObject.quote(code)},$format)", null)
            }
        }
    }

    private val picker = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = chooserCallback
        chooserCallback = null
        val data = result.data
        val uris = if (result.resultCode == Activity.RESULT_OK) {
            data?.clipData?.let { items ->
                Array(items.itemCount) { items.getItemAt(it).uri }
            } ?: data?.data?.let { arrayOf(it) }
        } else null
        callback?.onReceiveValue(uris)
    }

    private val saveDocument = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()) { result ->
        val bytes = pendingBytes
        val request = pendingBackupRequest
        val mime = pendingMime
        pendingMime = null
        pendingBytes = null
        pendingBackupRequest = null
        val uri = result.data?.data
        val saved = if (result.resultCode == Activity.RESULT_OK && uri != null && bytes != null) {
            val written = runCatching {
                requireNotNull(contentResolver.openOutputStream(uri, "wt")).use { it.write(bytes) }
            }.isSuccess
            if (written && mime == "application/json") AnalyticsService.event(this, "backup_created")
            Toast.makeText(this, if (written) "Резервная копия сохранена" else "Не удалось сохранить файл", Toast.LENGTH_SHORT).show()
            written
        } else false
        reportBackup(request, saved)
    }

    private fun reportBackup(request: Int?, saved: Boolean) {
        if (request != null && !isDestroyed && ::webView.isInitialized) {
            webView.evaluateJavascript("window.ForgeTrainingImport?.onBackupResult($request,$saved)", null)
        }
    }

    private fun exportDocument(filename: String, base64: String, mime: String, request: Int? = null) {
        runOnUiThread {
            if (pendingBytes != null || chooserCallback != null) {
                reportBackup(request, false)
                return@runOnUiThread
            }
            try {
                require(base64.length <= 30_000_000)
                pendingBytes = Base64.decode(base64, Base64.DEFAULT)
                pendingBackupRequest = request
                pendingMime = mime
                val name = filename.substringAfterLast('/').substringAfterLast('\\').ifBlank { "forge-backup.json" }
                val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = mime.ifBlank { "application/octet-stream" }
                    putExtra(Intent.EXTRA_TITLE, name)
                }
                saveDocument.launch(intent)
            } catch (_: Exception) {
                pendingBytes = null
                pendingBackupRequest = null
                pendingMime = null
                reportBackup(request, false)
                Toast.makeText(this, "Не удалось подготовить экспорт", Toast.LENGTH_LONG).show()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        backCallback = object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (backPending || !navigationReady || !::webView.isInitialized) return
                if (ViewCompat.getRootWindowInsets(webView)?.isVisible(WindowInsetsCompat.Type.ime()) == true) {
                    WindowCompat.getInsetsController(window, webView).hide(WindowInsetsCompat.Type.ime())
                    return
                }
                backPending = true
                webView.evaluateJavascript("(function(){try{return window.ForgeNavigation ? window.ForgeNavigation.back() : 'not-ready'}catch(e){console.error(e);return 'error'}})()") { result ->
                    backPending = false
                    if (result == "\"exit\"" && navigationReady && !internalBack) {
                        if (hasDocumentHistory()) webView.goBack()
                        else { isEnabled = false; onBackPressedDispatcher.onBackPressed() }
                    }
                    // Undefined, loading and JS errors never finish the Activity.
                }
            }
        }
        onBackPressedDispatcher.addCallback(this, backCallback)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        assetLoader = WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        webView = WebView(this)
        val container = FrameLayout(this)
        container.addView(webView, FrameLayout.LayoutParams(-1, -1))
        setContentView(container)
        webView.setBackgroundColor(Color.rgb(11, 16, 22))
        ViewCompat.setOnApplyWindowInsetsListener(container) { view, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
            imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime())
            view.setPadding(systemBars.left, systemBars.top, systemBars.right, maxOf(systemBars.bottom, keyboard.bottom))
            updateBackCallback()
            WindowInsetsCompat.CONSUMED
        }
        webView.settings.textZoom = (resources.configuration.fontScale * 100).toInt()
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.userAgentString += " FORGE-Training/${BuildConfig.VERSION_NAME}"
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = true
        webView.settings.setSupportMultipleWindows(false)
        webView.settings.allowFileAccessFromFileURLs = false
        webView.settings.allowUniversalAccessFromFileURLs = false
        webView.settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView, "ForgeNative", setOf(assetHost)) { _, message, origin, mainFrame, reply ->
                if (mainFrame && origin.toString() == assetHost && isLocalAsset(webView.url?.let(Uri::parse))) {
                    handleMessage(message.data, reply)
                }
            }
        }
        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                navigationReady = false
                internalBack = true
                backPending = false
                updateBackCallback()
            }
            override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                val uri = request?.url ?: return null
                if (request.isForMainFrame && !isLocalAsset(uri)) return WebResourceResponse("text/plain", "utf-8", null)
                val response = assetLoader.shouldInterceptRequest(uri)
                if (response != null && uri.path?.endsWith(".html") == true) {
                    response.responseHeaders = response.responseHeaders.orEmpty() + mapOf(
                        "Content-Security-Policy" to "script-src 'self' 'unsafe-inline'; frame-src 'none'; object-src 'none'; base-uri 'none'",
                        "Referrer-Policy" to "no-referrer"
                    )
                }
                return response
            }
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val uri = request?.url ?: return false
                if (!request.isForMainFrame) return true
                if (isLocalAsset(uri)) return false
                if (uri.scheme == "https" || uri.scheme == "http") {
                    try { startActivity(Intent(Intent.ACTION_VIEW, uri)) } catch (_: Exception) {}
                    return true
                }
                return true
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView?, callback: ValueCallback<Array<Uri>>?, params: WebChromeClient.FileChooserParams?): Boolean {
                if (pendingBytes != null) { callback?.onReceiveValue(null); return true }
                chooserCallback?.onReceiveValue(null); chooserCallback = callback
                val accepts = params?.acceptTypes?.joinToString(",") ?: ""
                val textImport = accepts.contains("text/plain") || accepts.contains(".txt")
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = when {
                        accepts.contains("image/") -> "image/*"
                        textImport -> "*/*"
                        else -> "application/json"
                    }
                    if (textImport) putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("text/plain", "application/json", "text/json", "application/octet-stream"))
                    if (params?.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                }
                return try { picker.launch(intent); true } catch (_: Exception) { chooserCallback = null; callback?.onReceiveValue(null); false }
            }
        }
        webView.loadUrl(assetHost + "/assets/index.html")
        if (savedInstanceState == null) AnalyticsService.event(this, "app_opened")
    }

    override fun onResume() {
        super.onResume()
        RestReminder.activityVisible = true
    }

    override fun onPause() {
        RestReminder.activityVisible = false
        if (::webView.isInitialized) webView.evaluateJavascript("window.ForgeNavigation && window.ForgeNavigation.persist(); window.ForgePerformance && window.ForgePerformance.persist()", null)
        super.onPause()
    }

    private fun isLocalAsset(uri: Uri?): Boolean =
        uri?.scheme == "https" && uri.authority == "appassets.androidplatform.net" && uri.path?.startsWith("/assets/") == true

    private fun handleMessage(data: String?, reply: JavaScriptReplyProxy) {
        if (data == null || data.length > 30_010_000) return
        val message = runCatching { JSONObject(data) }.getOrNull() ?: return
        when (message.optString("action")) {
            "navigation" -> {
                navigationReady = message.optBoolean("ready")
                internalBack = message.optBoolean("canGoBack")
                updateBackCallback()
            }
            "preferences" -> reportPreferences(reply)
            "storeCloudSession", "readCloudSession" -> sessionMessage(message, reply)
            "healthRead" -> requestHealth(reply)
            "healthDisconnect" -> disconnectHealth(reply)
            "analyticsConsent" -> {
                val enabled = message.optBoolean("enabled")
                val previous = AnalyticsService.enabled(this)
                AnalyticsService.consent(this, enabled)
                if (enabled && !previous) AnalyticsService.event(this, "app_opened")
                reportPreferences(reply)
            }
            "crashConsent" -> {
                diagnostics.consent(message.optBoolean("enabled"))
                reportPreferences(reply)
            }
            "analyticsEvent" -> AnalyticsService.event(this, message.optString("event"))
            "diagnosticEvent" -> diagnostics.record(message.optString("category"))
            "restDeadline" -> RestReminder.sync(this, message.optLong("deadline"))
            "notificationConsent" -> {
                val enabled = message.optBoolean("enabled")
                if (enabled && android.os.Build.VERSION.SDK_INT >= 33 &&
                    checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    if (notificationReply == null) {
                        notificationReply = reply
                        notifications.launch(android.Manifest.permission.POST_NOTIFICATIONS)
                    }
                } else {
                    RestReminder.toggle(this, enabled)
                    reportPreferences(reply)
                }
            }
            "scanBarcode" -> {
                if (!scannerOpen) {
                    scannerOpen = true
                    runCatching { scanner.launch(Intent(this, BarcodeScannerActivity::class.java)) }
                        .onFailure { scannerOpen = false }
                }
            }
            "export" -> {
                val mime = message.optString("mime")
                val request = message.optInt("request", -1).takeIf { it >= 0 }
                if (mime !in setOf("application/json", "text/csv")) {
                    reportBackup(request, false)
                    return
                }
                exportDocument(message.optString("filename").take(200), message.optString("base64"), mime, request)
            }
            "checkpoint", "readCheckpoint", "deleteCheckpoint", "diagnostics" -> checkpointMessage(message, reply)
        }
    }

    private fun post(reply: JavaScriptReplyProxy, data: JSONObject) {
        if (!isDestroyed) runCatching { reply.postMessage(data.toString()) }
    }

    private fun sessionMessage(message: JSONObject, reply: JavaScriptReplyProxy) {
        val save = message.optString("action") == "storeCloudSession"
        storageWorker.execute {
            val response = JSONObject()
            if (save) {
                val ok = runCatching { vault.save(message.optJSONObject("session")) }.isSuccess
                response.put("kind", "cloudStored").put("ok", ok)
            } else {
                response.put("kind", "cloudSession").put("session", runCatching { vault.load() }.getOrNull())
            }
            runOnUiThread { post(reply, response) }
        }
    }

    private fun requestHealth(reply: JavaScriptReplyProxy) {
        if (android.os.Build.VERSION.SDK_INT < 34 || !ForgeHealth.available(this) || healthReply != null) return
        healthPreferences.edit().putBoolean("enabled", true).apply()
        val missing = ForgeHealth.permissions().filter { checkSelfPermission(it) != android.content.pm.PackageManager.PERMISSION_GRANTED }
        if (missing.isEmpty()) readHealth(reply) else {
            healthReply = reply
            healthPermission.launch(missing.toTypedArray())
        }
    }

    @androidx.annotation.RequiresApi(34)
    private fun readHealth(reply: JavaScriptReplyProxy) {
        val generation = ++healthGeneration
        lifecycleScope.launch {
            val result = runCatching { ForgeHealth.read(this@MainActivity) }
                .getOrElse { JSONObject().put("kind", "health").put("ok", false) }
            if (generation == healthGeneration && healthPreferences.getBoolean("enabled", false)) post(reply, result)
        }
    }

    private fun disconnectHealth(reply: JavaScriptReplyProxy) {
        healthGeneration++
        healthReply = null
        healthPreferences.edit().remove("enabled").apply()
        post(reply, JSONObject().put("kind", "healthDisconnected"))
        if (android.os.Build.VERSION.SDK_INT >= 34) {
            val granted = ForgeHealth.permissions().filter { checkSelfPermission(it) == android.content.pm.PackageManager.PERMISSION_GRANTED }
            if (granted.isNotEmpty()) revokeSelfPermissionsOnKill(granted)
        }
    }

    private fun reportPreferences(reply: JavaScriptReplyProxy) {
        val report = JSONObject().put("kind", "preferences")
            .put("analyticsAvailable", AnalyticsService.configured)
            .put("analytics", AnalyticsService.enabled(this))
            .put("crashAvailable", diagnostics.configured())
            .put("crash", diagnostics.enabled())
            .put("testReport", BuildConfig.DEBUG)
            .put("healthAvailable", ForgeHealth.available(this))
            .put("notifications", RestReminder.enabled(this) && androidx.core.app.NotificationManagerCompat.from(this).areNotificationsEnabled())
            .put("camera", checkSelfPermission(android.Manifest.permission.CAMERA) == android.content.pm.PackageManager.PERMISSION_GRANTED)
        runCatching { reply.postMessage(report.toString()) }
    }

    private fun checkpointMessage(message: JSONObject, reply: JavaScriptReplyProxy) {
        val action = message.optString("action")
        val webVersion = WebViewCompat.getCurrentWebViewPackage(this)?.versionName ?: "не определена"
        storageWorker.execute {
            val dao = runCatching { ForgeDatabase.get(applicationContext).checkpoints() }
            val result = JSONObject()
            when (action) {
                "checkpoint" -> {
                    val saved = dao.mapCatching { it.save(message.getString("payload")) }.isSuccess
                    if (saved) AnalyticsService.event(applicationContext, "backup_created")
                    result.put("kind", "saved").put("ok", saved)
                }
                "deleteCheckpoint" -> result.put("kind", "deleted").put("ok", dao.mapCatching { it.delete() }.isSuccess)
                "readCheckpoint" -> result.put("kind", "checkpoint").put("payload", dao.mapCatching { it.read() }.getOrNull()?.payload)
                "diagnostics" -> {
                    val checkpoint = dao.mapCatching { it.read() }
                    val status = when {
                        checkpoint.isFailure -> "недоступна"
                        checkpoint.getOrNull() != null -> "целостность проверена"
                        else -> "нет проверенной копии"
                    }
                    result.put("kind", "diagnostics").put("details", JSONObject()
                        .put("FORGE", "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
                        .put("Android API", android.os.Build.VERSION.SDK_INT)
                        .put("WebView", webVersion)
                        .put("Хранилище", "локальный дневник WebView")
                        .put("Резервная копия Room", status)
                        .put("Сканер", "CameraX, встроенная модель ML Kit")
                        .put("Open Food Facts", "по запросу пользователя")
                        .put("Crashlytics", if (diagnostics.configured()) "проект задан" else "нет проекта")
                        .put("PostHog", if (AnalyticsService.configured) "проект задан" else "нет проекта")
                        .put("Health Connect", if (ForgeHealth.available(this)) "доступен по запросу" else "нужен Android 14 или новее")
                        .put("Платежи", "отключены"))
                }
            }
            runOnUiThread { if (!isDestroyed) runCatching { reply.postMessage(result.toString()) } }
        }
    }

    override fun onDestroy() {
        storageWorker.shutdown()
        if (::webView.isInitialized) webView.destroy()
        super.onDestroy()
    }
}
