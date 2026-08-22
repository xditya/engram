package expo.modules.engramocr

import android.content.Context
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise

// Play flavor: ML Kit with the bundled Latin model (no Play Services download needed).
object OcrEngine {
  fun isAvailable(): Boolean = true

  fun recognize(context: Context, uri: String, promise: Promise) {
    val image = try {
      InputImage.fromFilePath(context, Uri.parse(if (uri.contains("://")) uri else "file://$uri"))
    } catch (e: Exception) {
      promise.reject("E_OCR_LOAD", e.message ?: "Could not load image", e)
      return
    }
    TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      .process(image)
      .addOnSuccessListener { promise.resolve(it.text) }
      .addOnFailureListener { promise.reject("E_OCR", it.message ?: "Text recognition failed", it) }
  }
}
