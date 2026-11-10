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
import java.util.concurrent.Executors
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.PermissionRequest
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
    private var pendingWebPermission: PermissionRequest? = null
    private val cameraPermissionLauncher = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestPermission()) { granted ->
        val req = pendingWebPermission; pendingWebPermission = null
        if (granted) req?.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) else req?.deny()
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
        pendingBytes = null
        pendingBackupRequest = null
        val uri = result.data?.data
        val saved = if (result.resultCode == Activity.RESULT_OK && uri != null && bytes != null) {
            val written = runCatching {
                requireNotNull(contentResolver.openOutputStream(uri, "wt")).use { it.write(bytes) }
            }.isSuccess
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
            override fun onPermissionRequest(request: PermissionRequest?) {
                runOnUiThread {
                    val allowed = request?.resources?.filter { it == PermissionRequest.RESOURCE_VIDEO_CAPTURE }?.toTypedArray() ?: emptyArray()
                    if (allowed.isEmpty() || request?.origin?.toString() != assetHost) { request?.deny(); return@runOnUiThread }
                    if (checkSelfPermission(android.Manifest.permission.CAMERA) == android.content.pm.PackageManager.PERMISSION_GRANTED) request?.grant(allowed)
                    else if (pendingWebPermission != null) request?.deny()
                    else { pendingWebPermission = request; cameraPermissionLauncher.launch(android.Manifest.permission.CAMERA) }
                }
            }
            override fun onPermissionRequestCanceled(request: PermissionRequest?) {
                if (pendingWebPermission === request) pendingWebPermission = null
            }
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
    }

    override fun onPause() {
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

    private fun checkpointMessage(message: JSONObject, reply: JavaScriptReplyProxy) {
        val action = message.optString("action")
        val webVersion = WebViewCompat.getCurrentWebViewPackage(this)?.versionName ?: "не определена"
        storageWorker.execute {
            val dao = runCatching { ForgeDatabase.get(applicationContext).checkpoints() }
            val result = JSONObject()
            when (action) {
                "checkpoint" -> result.put("kind", "saved").put("ok", dao.mapCatching { it.save(message.getString("payload")) }.isSuccess)
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
                        .put("Резервная копия Room", status))
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
