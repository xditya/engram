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
    Function("takeSharedPasteboard") { () -> [String] in
      guard let pb = UIPasteboard(name: UIPasteboard.Name("app.engram.share"), create: false) else { return [] }
      let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("shared", isDirectory: true)
      try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      var out: [String] = []
      for item in pb.items {
        guard let data = item["public.data"] as? Data else { continue }
        let name = (item["public.utf8-plain-text"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "\(UUID().uuidString).bin"
        let url = dir.appendingPathComponent("\(UUID().uuidString)-\(name)")
        if (try? data.write(to: url)) != nil { out.append(url.absoluteString) }
      }
      pb.items = []
      return out
    }
  }
}
