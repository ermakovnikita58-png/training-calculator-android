package ru.trainingcalculator.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.util.Base64
import android.webkit.JavascriptInterface
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

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private val assetHost = "https://appassets.androidplatform.net"
    private lateinit var assetLoader: WebViewAssetLoader
    private var chooserCallback: ValueCallback<Array<Uri>>? = null
    private var pendingBytes: ByteArray? = null
    private var pendingMime = "application/octet-stream"
    private var pendingName = "forge-backup.json"
    private var pendingWebPermission: PermissionRequest? = null
    private var awaitingBackResult = false
    private val cameraPermissionLauncher = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestPermission()) { granted ->
        val req = pendingWebPermission; pendingWebPermission = null
        if (granted) req?.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) else req?.deny()
    }

    private val picker = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = chooserCallback
        if (callback != null) {
            val uri = if (result.resultCode == Activity.RESULT_OK) result.data?.data else null
            callback.onReceiveValue(if (uri != null) arrayOf(uri) else null)
            chooserCallback = null
            return@registerForActivityResult
        }
        if (result.resultCode == Activity.RESULT_OK) {
            val uri = result.data?.data
            val bytes = pendingBytes
            if (uri != null && bytes != null) {
                try { contentResolver.openOutputStream(uri)?.use { it.write(bytes) }; Toast.makeText(this, "Резервная копия сохранена", Toast.LENGTH_SHORT).show() }
                catch (_: Exception) { Toast.makeText(this, "Не удалось сохранить файл", Toast.LENGTH_LONG).show() }
            }
        }
        pendingBytes = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (!::webView.isInitialized || awaitingBackResult) return
                awaitingBackResult = true
                webView.evaluateJavascript("window.f6HandleAndroidBack?.() ?? 'pending'") { result ->
                    awaitingBackResult = false
                    if (result == "\"exit\"" && !isFinishing) finish()
                }
            }
        })
        assetLoader = WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        webView = WebView(this)
        setContentView(webView)
        webView.setBackgroundColor(Color.rgb(11, 16, 22))
        ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
            var safeArea = WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            if (Build.VERSION.SDK_INT >= 35) safeArea = safeArea or WindowInsetsCompat.Type.ime()
            val padding = insets.getInsets(safeArea)
            view.setPadding(padding.left, padding.top, padding.right, padding.bottom)
            insets
        }
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = true
        webView.settings.setSupportMultipleWindows(false)
        webView.settings.allowFileAccessFromFileURLs = false
        webView.settings.allowUniversalAccessFromFileURLs = false
        webView.settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        webView.addJavascriptInterface(Bridge(), "AndroidBridge")
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                return request?.url?.let { assetLoader.shouldInterceptRequest(it) }
            }
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val uri = request?.url ?: return false
                if (uri.toString().startsWith(assetHost + "/assets/")) return false
                if (uri.scheme == "https" || uri.scheme == "http") {
                    try { startActivity(Intent(Intent.ACTION_VIEW, uri)) } catch (_: Exception) {}
                    return true
                }
                return uri.scheme != "file" && uri.scheme != "about" && uri.scheme != "data" && uri.scheme != "blob"
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest?) {
                runOnUiThread {
                    val allowed = request?.resources?.filter { it == PermissionRequest.RESOURCE_VIDEO_CAPTURE }?.toTypedArray() ?: emptyArray()
                    if (allowed.isEmpty() || request?.origin?.toString() != assetHost) { request?.deny(); return@runOnUiThread }
                    if (checkSelfPermission(android.Manifest.permission.CAMERA) == android.content.pm.PackageManager.PERMISSION_GRANTED) request?.grant(allowed)
                    else { pendingWebPermission = request; cameraPermissionLauncher.launch(android.Manifest.permission.CAMERA) }
                }
            }
            override fun onShowFileChooser(view: WebView?, callback: ValueCallback<Array<Uri>>?, params: WebChromeClient.FileChooserParams?): Boolean {
                chooserCallback?.onReceiveValue(null); chooserCallback = callback
                val accepts = params?.acceptTypes?.joinToString(",") ?: ""
                val mime = if (accepts.contains("image/")) "image/*" else "application/json"
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply { addCategory(Intent.CATEGORY_OPENABLE); type = mime }
                return try { picker.launch(intent); true } catch (_: Exception) { chooserCallback = null; callback?.onReceiveValue(null); false }
            }
        }
        webView.loadUrl(assetHost + "/assets/index.html")
    }

    inner class Bridge {
        @JavascriptInterface fun saveBlob(filename: String, base64: String, mimeType: String) {
            runOnUiThread {
                try {
                    if (base64.length > 30_000_000) throw IllegalArgumentException("Export too large")
                    pendingBytes = Base64.decode(base64, Base64.DEFAULT)
                    pendingMime = mimeType.ifBlank { "application/octet-stream" }
                    pendingName = filename.substringAfterLast('/').substringAfterLast('\\').ifBlank { "forge-backup.json" }
                    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply { addCategory(Intent.CATEGORY_OPENABLE); type = pendingMime; putExtra(Intent.EXTRA_TITLE, pendingName) }
                    picker.launch(intent)
                } catch (_: Exception) { pendingBytes = null; Toast.makeText(this@MainActivity, "Не удалось подготовить экспорт", Toast.LENGTH_LONG).show() }
            }
        }
    }
    override fun onDestroy() { if (::webView.isInitialized) { webView.removeJavascriptInterface("AndroidBridge"); webView.destroy() }; super.onDestroy() }
}
