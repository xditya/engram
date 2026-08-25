import ExpoModulesCore
import Foundation
import UIKit

// What the share path depends on, as the running app sees it. Read-only; no side effects beyond a
// throw-away UserDefaults key used to prove the App Group suite is really shared.
public class EngramDiagModule: Module {
  public func definition() -> ModuleDefinition {
    Name("EngramDiag")

    Function("shareDiagnostics") { () -> [String: Any] in
      let info = Bundle.main.infoDictionary ?? [:]
      let alt = info["ALTAppGroups"] as? [String] ?? []
      let configured = info["AppGroupIdentifier"] as? String ?? ""
      let group = alt.first ?? (configured.isEmpty ? nil : configured)
      var out: [String: Any] = [
        "bundleId": Bundle.main.bundleIdentifier ?? "",
        "altAppGroups": alt,
        "configuredGroup": configured,
        "resolvedGroup": group ?? "",
      ]
      if let g = group {
        let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: g)
        out["containerPath"] = container?.path ?? ""
        out["containerAccessible"] = container != nil
        if let ud = UserDefaults(suiteName: g) {
          let key = "engram.diag.probe"
          ud.set("ok", forKey: key)
          out["userDefaultsRoundTrip"] = ud.string(forKey: key) == "ok"
          ud.removeObject(forKey: key)
          out["shareKeysInGroup"] = ud.dictionaryRepresentation().keys.filter { $0.lowercased().contains("share") }.sorted()
        } else {
          out["userDefaultsRoundTrip"] = false
          out["shareKeysInGroup"] = []
        }
      }
      var plugins: [String] = []
      if let dir = Bundle.main.builtInPlugInsURL,
         let items = try? FileManager.default.contentsOfDirectory(atPath: dir.path) {
        plugins = items
      }
      out["pluginsFound"] = plugins
      if let dir = Bundle.main.builtInPlugInsURL, let first = plugins.first,
         let b = Bundle(url: dir.appendingPathComponent(first)) {
        out["extensionBundleId"] = b.bundleIdentifier ?? ""
        out["extensionGroup"] = (b.infoDictionary?["ALTAppGroups"] as? [String])?.first ?? ""
      }
      return out
    }

    // Media the share extension parked on the same-team named pasteboard because no App Group was usable.
    // Each item is copied into the caches directory; the pasteboard is cleared. Returns file:// URIs.
    // What each pasteboard holds right now, for the share log; reading general here is what triggers iOS's paste gate.
    Function("sharedPasteboardInfo") { () -> [String: Any] in
      let named = UIPasteboard(name: UIPasteboard.Name("app.engram.share"), create: false)
      let g = UIPasteboard.general
      return [
        "named": named?.numberOfItems ?? -1,
        "general": g.numberOfItems,
        "generalTypes": g.types.prefix(6).joined(separator: ","),
        "generalOurs": g.items.contains { $0["app.engram.share"] != nil },
        "active": UIApplication.shared.applicationState == .active,
      ]
    }
    Function("takeSharedPasteboard") { () -> [String] in
      // The named pasteboard is tried first; if it did not survive the extension process, the general pasteboard
      // holds the same items, marked with our key so nothing the user copied is ever taken.
      let named = UIPasteboard(name: UIPasteboard.Name("app.engram.share"), create: false)
      let ours = { (pb: UIPasteboard) in pb.items.contains { $0["app.engram.share"] != nil } }
      let pb: UIPasteboard
      if let n = named, n.numberOfItems > 0 { pb = n }
      else if ours(UIPasteboard.general) { pb = UIPasteboard.general }
      else { return [] }
      let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("shared", isDirectory: true)
      try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      var out: [String] = []
      for item in pb.items {
        guard let data = item["public.data"] as? Data else { continue }
        var name = (item["public.utf8-plain-text"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "\(UUID().uuidString).bin"
        // The extension labels raw image bytes ".jpg" whatever they are, and the app derives the mime type from the
        // extension, so correct it from the magic bytes. JPEG / PNG / HEIC are all known to the media table.
        if let ext = sniffImageExtension(data), (name as NSString).pathExtension.lowercased() != ext {
          name = (name as NSString).deletingPathExtension + "." + ext
        }
        let url = dir.appendingPathComponent("\(UUID().uuidString)-\(name)")
        if (try? data.write(to: url)) != nil { out.append(url.absoluteString) }
      }
      pb.items = []
      named?.items = []
      if ours(UIPasteboard.general) { UIPasteboard.general.items = [] }
      return out
    }
  }
}

private func sniffImageExtension(_ d: Data) -> String? {
  guard d.count >= 12 else { return nil }
  if d.starts(with: [0xFF, 0xD8, 0xFF]) { return "jpg" }
  if d.starts(with: [0x89, 0x50, 0x4E, 0x47]) { return "png" }
  if d[4..<8].elementsEqual("ftyp".utf8) {
    let brand = String(decoding: d[8..<12], as: UTF8.self)
    if brand.hasPrefix("hei") || brand.hasPrefix("mif") { return "heic" }
  }
  return nil
}
