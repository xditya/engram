package expo.modules.engramocr

import android.content.Context
import expo.modules.kotlin.Promise

// F-Droid flavor: ML Kit is non-free, so there is no engine. Platform.ocr stays undefined and ocr jobs are skipped.
object OcrEngine {
  fun isAvailable(): Boolean = false

  fun recognize(context: Context, uri: String, promise: Promise) {
    promise.reject("E_OCR_UNAVAILABLE", "Text recognition isn't available in this build", null)
  }
}
