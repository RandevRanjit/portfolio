// pdf/portfolio.typ — Randev Ranjit · Designed Portfolio
// Run: typst compile pdf/portfolio.typ public/randev-ranjit-portfolio.pdf
#import "lib.typ": *

#let data = json("data/projects.json")

// --- document defaults ---
#set text(font: "Inter", size: 10pt, fill: ink)
#set page(
  paper: "a4",
  fill: paper,
  margin: (x: 2.2cm, y: 2cm),
)

// --- cover ---
#cover(
  "Randev Ranjit",
  "Designed and engineered, artfully — silicon to software.",
  "BSc Computer Science, Manchester (2023–2026) · Incoming MSc Computer & Embedded Systems Engineering, TU Delft (Sept 2026)",
)

// --- index ---
#index-page(data.projects)

// --- projects, grouped by primary spoke with dividers ---
// Spoke order: finance → drone → motorsport
#let spoke-order = ("quant", "drones", "motorsport", "music", "other")
#let spoke-labels = (
  quant:      "Quantitative Finance",
  drones:     "Drones",
  motorsport: "Motorsport",
  music:      "Music",
  other:      "Other",
)

// Track which spoke dividers have been printed
#let printed-dividers = ()

// Sort projects by order (already sorted from export, but be explicit)
#let projects = data.projects

#for spoke-id in spoke-order {
  // Collect projects whose primary spoke matches
  let group = projects.filter(p => p.section == spoke-id)
  if group.len() > 0 {
    spoke-divider(spoke-id, spoke-labels.at(spoke-id))
    for p in group {
      let accent = accents.at(spoke-id, default: ink)
      project-block(p, accent)
    }
  }
}
