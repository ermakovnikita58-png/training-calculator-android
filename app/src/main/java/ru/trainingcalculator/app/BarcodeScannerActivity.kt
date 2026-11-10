package ru.trainingcalculator.app

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors

class BarcodeScannerActivity : ComponentActivity() {
    private val analyzer = Executors.newSingleThreadExecutor()
    private val options = BarcodeScannerOptions.Builder().setBarcodeFormats(
        Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8, Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E
    ).build()
    private val scanner by lazy { BarcodeScanning.getClient(options) }
    private lateinit var preview: PreviewView
    private lateinit var torch: Button
    private var analysis: ImageAnalysis? = null
    private var camera: Camera? = null
    private var completed = false

    private val permission = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        if (it) startCamera() else returnToManual("Разрешение на камеру не предоставлено")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = FrameLayout(this)
        root.setBackgroundColor(Color.BLACK)
        preview = PreviewView(this).apply {
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            contentDescription = "Предпросмотр камеры. Нажми для фокусировки"
            setOnClickListener { focus() }
        }
        root.addView(preview, FrameLayout.LayoutParams(-1, -1))
        val frame = android.view.View(this).apply {
            background = GradientDrawable().apply {
                cornerRadius = dp(12).toFloat()
                setColor(Color.TRANSPARENT)
                setStroke(dp(2), Color.rgb(199, 243, 107))
            }
        }
        root.addView(frame, FrameLayout.LayoutParams(dp(250), dp(125), Gravity.CENTER))
        val hint = TextView(this).apply {
            text = "Наведи камеру на штрихкод EAN или UPC"
            setTextColor(Color.WHITE)
            setBackgroundColor(0xCC101411.toInt())
            gravity = Gravity.CENTER
            setPadding(dp(12), dp(10), dp(12), dp(10))
        }
        root.addView(hint, FrameLayout.LayoutParams(-1, -2, Gravity.TOP))
        val controls = LinearLayout(this).apply { gravity = Gravity.CENTER }
        controls.addView(Button(this).apply {
            text = "Ввести вручную"
            setOnClickListener { finish() }
        })
        torch = Button(this).apply {
            text = "Фонарь"
            isEnabled = false
            setOnClickListener {
                val active = camera ?: return@setOnClickListener
                active.cameraControl.enableTorch(active.cameraInfo.torchState.value != androidx.camera.core.TorchState.ON)
            }
        }
        controls.addView(torch)
        root.addView(controls, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM))
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        setContentView(root)
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) startCamera()
        else if (savedInstanceState == null) permission.launch(Manifest.permission.CAMERA)
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    private fun focus() {
        if (preview.width == 0 || preview.height == 0) return
        val point = preview.meteringPointFactory.createPoint(preview.width / 2f, preview.height / 2f)
        camera?.cameraControl?.startFocusAndMetering(FocusMeteringAction.Builder(point).build())
    }

    private fun returnToManual(message: String) {
        if (completed || isDestroyed || isFinishing) return
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
        finish()
    }

    @androidx.annotation.OptIn(ExperimentalGetImage::class)
    private fun startCamera() {
        val future = ProcessCameraProvider.getInstance(this)
        val main = ContextCompat.getMainExecutor(this)
        future.addListener({
            if (isFinishing || isDestroyed) return@addListener
            try {
                val cameraProvider = future.get()
                val selector = if (cameraProvider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA)) {
                    CameraSelector.DEFAULT_BACK_CAMERA
                } else CameraSelector.DEFAULT_FRONT_CAMERA
                val stream = Preview.Builder().build().also { it.surfaceProvider = preview.surfaceProvider }
                val reader = ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
                analysis = reader
                val detector = scanner
                reader.setAnalyzer(analyzer) { image ->
                    val frame = image.image
                    if (frame == null) {
                        image.close()
                        return@setAnalyzer
                    }
                    val input = InputImage.fromMediaImage(frame, image.imageInfo.rotationDegrees)
                    runCatching {
                        detector.process(input).addOnCompleteListener(main) { task ->
                            image.close()
                            if (completed || isFinishing || isDestroyed || !task.isSuccessful) return@addOnCompleteListener
                            val barcode = task.result.firstOrNull {
                                val value = it.rawValue
                                value != null && RetailBarcode.valid(value, it.format == Barcode.FORMAT_UPC_E)
                            } ?: return@addOnCompleteListener
                            completed = true
                            analysis?.clearAnalyzer()
                            setResult(Activity.RESULT_OK, Intent().putExtra(EXTRA_CODE, barcode.rawValue)
                                .putExtra(EXTRA_COMPRESSED, barcode.format == Barcode.FORMAT_UPC_E))
                            finish()
                        }
                    }.onFailure { image.close() }
                }
                val bound = cameraProvider.bindToLifecycle(this, selector, stream, reader)
                camera = bound
                torch.isEnabled = bound.cameraInfo.hasFlashUnit()
                preview.post { focus() }
            } catch (_: Exception) {
                returnToManual("Камера недоступна. Введи штрихкод вручную")
            }
        }, main)
    }

    override fun onDestroy() {
        analysis?.clearAnalyzer()
        if (analysis != null) scanner.close()
        analyzer.shutdown()
        super.onDestroy()
    }

    companion object {
        const val EXTRA_CODE = "barcode"
        const val EXTRA_COMPRESSED = "upce"
    }
}
