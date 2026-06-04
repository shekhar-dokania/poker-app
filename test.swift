import Foundation
let str = "2026-06-04T07:22:25.123Z"
let formatter = ISO8601DateFormatter()
formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
var date = formatter.date(from: str)
if date == nil {
    formatter.formatOptions = [.withInternetDateTime]
    date = formatter.date(from: str)
}
if let d = date {
    print("Parsed: \(d)")
} else {
    print("Failed to parse")
}
