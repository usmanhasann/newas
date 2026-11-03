import ImageIO
import SwiftUI
import UIKit
import WidgetKit

// Home-screen widget (client spec 2026-09-29): the latest moods of the people in one of your
// PRIVATE circles, Large size only.
//
// The app (src/features/widget) writes its settings into the shared App Group: a read-only widget
// key, the chosen circle, and where to fetch from. This widget fetches the circle's feed by itself
// (the widget_feed database function) whenever iOS refreshes it — so it updates even when LYSM isn't
// open, on iOS's schedule (typically every 15–60 minutes).
//
// The rules below mirror src/features/widget/layout.ts exactly — keep them in step:
//  - Other members only; a mood shows only while its entry is under 24 hours old.
//  - 4 or fewer other members: everyone gets a row (blank when nothing recent).
//  - 5 or more: the 4 most recent entries, one row per person. Newest first.

// MARK: - Settings the app hands over (src/features/widget/native.ts → IOS_WIDGET_KEYS)

private enum Shared {
  // Must match ios.entitlements in app.config.ts.
  static let appGroup = "group.com.lysm.app"
  // The last good feed (for offline) and the circle + key it belongs to; the app clears both
  // (src/features/widget/native.ts) when the widget is switched off or the account signs out.
  static let cacheKey = "widget.cachedFeed"
  static let cacheOwnerKey = "widget.cachedFeedFor"

  static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }
  static var key: String? { defaults?.string(forKey: "widget.key") }
  static var circleId: String? { defaults?.string(forKey: "widget.circleId") }
  static var feedUrl: String? { defaults?.string(forKey: "widget.feedUrl") }
  static var apiKey: String? { defaults?.string(forKey: "widget.apiKey") }
}

// MARK: - Feed (what widget_feed returns)

struct FeedMember: Codable {
  let id: String
  let name: String
  let avatar: String?
  let moods: [String]
  /// Epoch milliseconds of their newest entry shared to the circle in the last 24 h, or nil.
  let at: Double?

  var date: Date? {
    guard let at = at else { return nil }
    return Date(timeIntervalSince1970: at / 1000)
  }
}

struct Feed: Codable {
  let circle: String
  /// How many OTHER approved members the circle has.
  let memberCount: Int
  let members: [FeedMember]

  enum CodingKeys: String, CodingKey {
    case circle
    case memberCount = "member_count"
    case members
  }
}

private struct FeedError: Codable {
  let error: String
}

// MARK: - Rules (mirror of src/features/widget/layout.ts)

struct Row: Identifiable {
  let id: String
  let name: String
  let initial: String
  let colorIndex: Int
  let moods: [String]
  let time: String?
}

enum Rules {
  static let maxRows = 4
  static let window: TimeInterval = 24 * 60 * 60

  static func isRecent(_ date: Date?, _ now: Date) -> Bool {
    guard let date = date else { return false }
    return max(0, now.timeIntervalSince(date)) < window
  }

  /// "Just now" under a minute, "N min" under an hour, then "1 hr" / "N hrs".
  static func relativeTime(_ date: Date, _ now: Date) -> String {
    let minutes = Int(max(0, now.timeIntervalSince(date)) / 60)
    if minutes < 1 { return "Just now" }
    if minutes < 60 { return "\(minutes) min" }
    let hours = minutes / 60
    return hours == 1 ? "1 hr" : "\(hours) hrs"
  }

  static func initial(_ name: String) -> String {
    guard let first = name.trimmingCharacters(in: .whitespacesAndNewlines).first else { return "?" }
    return String(first).uppercased()
  }

  static func colorIndex(_ id: String) -> Int {
    id.unicodeScalars.reduce(0) { $0 &+ Int($1.value) } % Palette.count
  }

  static func buildRows(_ feed: Feed, _ now: Date) -> [Row] {
    func row(_ member: FeedMember, _ recent: Bool) -> Row {
      Row(
        id: member.id,
        name: member.name,
        initial: initial(member.name),
        colorIndex: colorIndex(member.id),
        moods: recent ? member.moods : [],
        time: recent ? member.date.map { relativeTime($0, now) } : nil
      )
    }

    let recent = feed.members
      .filter { isRecent($0.date, now) }
      .sorted { ($0.date ?? .distantPast) > ($1.date ?? .distantPast) }

    if feed.memberCount <= maxRows {
      let blank = feed.members
        .filter { !isRecent($0.date, now) }
        .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
      let all = recent.map { row($0, true) } + blank.map { row($0, false) }
      return Array(all.prefix(maxRows))
    }
    return recent.prefix(maxRows).map { row($0, true) }
  }
}

enum Palette {
  // Colorsets generated from the design tokens (targets/widget/expo-target.config.js).
  private static let names = ["AvatarPurple", "AvatarViolet", "AvatarPink", "AvatarAmber"]
  static var count: Int { names.count }
  static func color(_ index: Int) -> Color { Color(names[index % names.count]) }
}

// MARK: - Loading

enum LoadResult {
  /// No circle picked, signed out, or the key/circle was refused.
  case needsSetup
  case feed(Feed, [String: UIImage])
}

enum FeedLoader {
  static func load() async -> LoadResult {
    guard
      let key = Shared.key,
      let circleId = Shared.circleId,
      let feedUrl = Shared.feedUrl,
      let apiKey = Shared.apiKey,
      let url = URL(string: feedUrl)
    else { return .needsSetup }

    var request = URLRequest(url: url, timeoutInterval: 15)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(apiKey, forHTTPHeaderField: "apikey")
    request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
    request.httpBody = try? JSONSerialization.data(withJSONObject: ["p_key": key, "p_circle": circleId])
    // The saved copy is only ever shown for the same circle and key it was fetched with.
    let cacheOwner = "\(circleId)|\(key)"

    let result = try? await URLSession.shared.data(for: request)
    if let result = result,
       let http = result.1 as? HTTPURLResponse,
       http.statusCode == 200 {
      let data = result.0
      if let feed = try? JSONDecoder().decode(Feed.self, from: data) {
        Shared.defaults?.set(data, forKey: Shared.cacheKey)
        Shared.defaults?.set(cacheOwner, forKey: Shared.cacheOwnerKey)
        return .feed(feed, await Avatars.load(feed.members))
      }
      if (try? JSONDecoder().decode(FeedError.self, from: data)) != nil {
        Shared.defaults?.removeObject(forKey: Shared.cacheKey)
        Shared.defaults?.removeObject(forKey: Shared.cacheOwnerKey)
        return .needsSetup
      }
    }

    // Offline or a server hiccup: keep showing the last good data for THIS circle (the time rules
    // still apply). Another circle's or account's copy is never shown.
    if Shared.defaults?.string(forKey: Shared.cacheOwnerKey) == cacheOwner,
       let data = Shared.defaults?.data(forKey: Shared.cacheKey),
       let feed = try? JSONDecoder().decode(Feed.self, from: data) {
      return .feed(feed, await Avatars.load(feed.members))
    }
    return .needsSetup
  }
}

enum Avatars {
  /// Pixels kept per photo: the 44 pt avatar at 3x.
  static let side = 132

  /// Profile photos for the members that can appear (the feed is newest-first), fetched together so a
  /// slow network holds the widget up for one timeout, not eight.
  static func load(_ members: [FeedMember]) async -> [String: UIImage] {
    await withTaskGroup(of: (String, UIImage?).self, returning: [String: UIImage].self) { group in
      for member in members.prefix(8) {
        guard let avatar = member.avatar, let url = URL(string: avatar) else { continue }
        let id = member.id
        group.addTask {
          let image = await Avatars.fetch(url)
          return (id, image)
        }
      }
      var images: [String: UIImage] = [:]
      for await (id, image) in group {
        if let image = image { images[id] = image }
      }
      return images
    }
  }

  /// Profile photos are stored at full size (a 12 MP photo is about 36 MB once decoded) and iOS stops
  /// a widget that uses more than about 30 MB. So the photo is downloaded to a file and decoded
  /// straight to a small thumbnail; the full-size image is never in memory.
  private static func fetch(_ url: URL) async -> UIImage? {
    let request = URLRequest(url: url, timeoutInterval: 10)
    guard let download = try? await URLSession.shared.download(for: request) else { return nil }
    let file = download.0
    defer { try? FileManager.default.removeItem(at: file) }

    guard let source = CGImageSourceCreateWithURL(file as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary)
    else { return nil }
    let options = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceShouldCacheImmediately: true,
      kCGImageSourceThumbnailMaxPixelSize: thumbnailLongSide(source),
    ] as CFDictionary
    guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, options) else { return nil }
    return downsample(UIImage(cgImage: thumbnail), side: CGFloat(side))
  }

  /// Thumbnails are sized by their longer side; the shorter one must still cover the square
  /// (capped, so a panorama can't make a big one).
  private static func thumbnailLongSide(_ source: CGImageSource) -> Int {
    guard let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let width = properties[kCGImagePropertyPixelWidth] as? Int,
          let height = properties[kCGImagePropertyPixelHeight] as? Int,
          min(width, height) > 0
    else { return side }
    return min(side * max(width, height) / min(width, height), side * 4)
  }

  /// Square-crops the (already small) thumbnail to `side` pixels.
  private static func downsample(_ image: UIImage, side: CGFloat) -> UIImage {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format)
    return renderer.image { _ in
      let scale = max(side / max(image.size.width, 1), side / max(image.size.height, 1))
      let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
      image.draw(in: CGRect(
        x: (side - size.width) / 2,
        y: (side - size.height) / 2,
        width: size.width,
        height: size.height
      ))
    }
  }
}

// MARK: - Timeline

enum Content {
  case needsSetup
  case circle(name: String, memberCount: Int, rows: [Row], photos: [String: UIImage])
}

struct MoodsEntry: TimelineEntry {
  let date: Date
  let content: Content

  static func make(from loaded: LoadResult, at date: Date) -> MoodsEntry {
    switch loaded {
    case .needsSetup:
      return MoodsEntry(date: date, content: .needsSetup)
    case .feed(let feed, let photos):
      return MoodsEntry(
        date: date,
        content: .circle(
          name: feed.circle,
          memberCount: feed.memberCount,
          rows: Rules.buildRows(feed, date),
          photos: photos
        )
      )
    }
  }

  /// Shown in the widget gallery and while loading.
  static var sample: MoodsEntry {
    let rows = [
      Row(id: "1", name: "Augie", initial: "A", colorIndex: 0, moods: ["Calm", "Grateful"], time: "25 min"),
      Row(id: "2", name: "Konah", initial: "K", colorIndex: 1, moods: ["Happy"], time: "1 hr"),
      Row(id: "3", name: "Sam", initial: "S", colorIndex: 2, moods: ["Tired", "Sad"], time: "3 hrs"),
      Row(id: "4", name: "Riley", initial: "R", colorIndex: 3, moods: [], time: nil),
    ]
    return MoodsEntry(
      date: Date(),
      content: .circle(name: "Your circle", memberCount: 4, rows: rows, photos: [:])
    )
  }
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> MoodsEntry {
    MoodsEntry.sample
  }

  func getSnapshot(in context: Context, completion: @escaping (MoodsEntry) -> Void) {
    if context.isPreview {
      completion(MoodsEntry.sample)
      return
    }
    Task {
      let loaded = await FeedLoader.load()
      completion(MoodsEntry.make(from: loaded, at: Date()))
    }
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<MoodsEntry>) -> Void) {
    Task {
      let loaded = await FeedLoader.load()
      let now = Date()

      // Keep the "min" / "hr" labels current: every 15 minutes for 2 hours, then hourly to 24 h…
      var dates: [Date] = [now]
      for step in 1...8 { dates.append(now.addingTimeInterval(Double(step) * 15 * 60)) }
      for hour in 3...24 { dates.append(now.addingTimeInterval(Double(hour) * 60 * 60)) }
      // …and the exact moment each mood turns 24 hours old, so it disappears on time.
      if case .feed(let feed, _) = loaded {
        for member in feed.members {
          if let date = member.date {
            let expiry = date.addingTimeInterval(Rules.window)
            if expiry > now { dates.append(expiry) }
          }
        }
      }

      let entries = Set(dates).sorted().map { MoodsEntry.make(from: loaded, at: $0) }
      // Ask for fresh data in about 30 minutes; iOS decides exactly when.
      completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(30 * 60))))
    }
  }
}

// MARK: - Views

struct AvatarView: View {
  let row: Row
  let photo: UIImage?

  var body: some View {
    if let photo = photo {
      Image(uiImage: photo)
        .resizable()
        .scaledToFill()
        .clipShape(Circle())
    } else {
      ZStack {
        Circle().fill(Palette.color(row.colorIndex))
        Text(row.initial)
          .font(.headline)
          .foregroundStyle(.white)
      }
    }
  }
}

struct MemberRowView: View {
  let row: Row
  let photo: UIImage?

  var body: some View {
    HStack(alignment: .center, spacing: 12) {
      AvatarView(row: row, photo: photo)
        .frame(width: 44, height: 44)
      VStack(alignment: .leading, spacing: 2) {
        HStack(alignment: .firstTextBaseline) {
          Text(row.name)
            .font(.subheadline.weight(.semibold))
            .lineLimit(1)
          Spacer(minLength: 8)
          if let time = row.time {
            Text(time)
              .font(.caption)
              .foregroundStyle(.secondary)
          }
        }
        // Plain text on purpose (no mood colors) — reads right in iOS's tinted and dark styles.
        if !row.moods.isEmpty {
          Text(row.moods.joined(separator: ", "))
            .font(.subheadline)
            .lineLimit(1)
        }
      }
    }
  }
}

struct CircleMoodsView: View {
  let entry: MoodsEntry

  var body: some View {
    switch entry.content {
    case .needsSetup:
      VStack(alignment: .leading, spacing: 8) {
        Text("LYSM")
          .font(.headline)
        Text("Open LYSM and choose a private circle in Profile → Home Widget.")
          .font(.subheadline)
          .foregroundStyle(.secondary)
        Spacer(minLength: 0)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

    case .circle(let name, let memberCount, let rows, let photos):
      VStack(alignment: .leading, spacing: 14) {
        Text(name)
          .font(.headline)
          .lineLimit(1)
        if rows.isEmpty {
          Text(memberCount == 0
               ? "No one else is in this circle yet."
               : "No moods shared in the last 24 hours.")
            .font(.subheadline)
            .foregroundStyle(.secondary)
        } else {
          ForEach(rows) { row in
            MemberRowView(row: row, photo: photos[row.id])
          }
        }
        Spacer(minLength: 0)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
  }
}

// MARK: - Widget

extension View {
  /// The widget's background and margins. The widget runs on every iOS the app runs on (from 16.4,
  /// targets/widget/expo-target.config.js): iOS 17 and later use the system's (containerBackground,
  /// which also adds the standard margins); iOS 16 gets the same look by hand.
  @ViewBuilder
  func widgetBackground() -> some View {
    if #available(iOS 17.0, *) {
      containerBackground(.background, for: .widget)
    } else {
      padding()
        .background(Color(UIColor.systemBackground))
    }
  }
}

struct CircleMoodsWidget: Widget {
  let kind = "CircleMoodsWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Provider()) { entry in
      CircleMoodsView(entry: entry)
        .widgetBackground()
    }
    .configurationDisplayName("Circle Moods")
    .description("How the people in one of your private circles are feeling.")
    .supportedFamilies([.systemLarge])
  }
}
