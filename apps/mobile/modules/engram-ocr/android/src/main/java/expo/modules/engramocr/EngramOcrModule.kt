package expo.modules.engramocr

import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class EngramOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("EngramOcr")

    Function("isAvailable") { OcrEngine.isAvailable() }

    AsyncFunction("recognizeText") { uri: String, promise: Promise ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      OcrEngine.recognize(context, uri, promise)
    }
  }
}
