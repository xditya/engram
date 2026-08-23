import ExpoModulesCore
import Foundation

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
  }
}
