import ExpoModulesCore
import Vision
import UIKit

public class EngramOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("EngramOcr")

    // Vision ships with every supported iOS version.
    Function("isAvailable") { () -> Bool in true }

    AsyncFunction("recognizeText") { (uri: String, promise: Promise) in
      let path = URL(string: uri)?.path ?? uri
      guard let cgImage = UIImage(contentsOfFile: path)?.cgImage else {
        promise.reject("E_OCR_LOAD", "Could not load image at \(path)")
        return
      }
      let request = VNRecognizeTextRequest { request, error in
        if let error = error {
          promise.reject("E_OCR", error.localizedDescription)
          return
        }
        let lines = (request.results as? [VNRecognizedTextObservation])?
          .compactMap { $0.topCandidates(1).first?.string } ?? []
        promise.resolve(lines.joined(separator: "\n"))
      }
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true

      DispatchQueue.global(qos: .userInitiated).async {
        do {
          try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
        } catch {
          promise.reject("E_OCR", error.localizedDescription)
        }
      }
    }
  }
}
