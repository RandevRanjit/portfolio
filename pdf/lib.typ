// pdf/lib.typ — TE/product components
// Teenage-Engineering aesthetic: warm paper, heavy Archivo display,
// IBM Plex Mono labels, thick rules, flat colour, numbered everything.

#let ink    = rgb("#111111")
#let paper  = rgb("#f4f1ea")
#let paper2 = rgb("#ebe7dc")
#let grey   = rgb("#8a857a")
#let line-c = rgb("#d9d4c7")

#let accents = (
  finance:    rgb("#1e40ff"),
  drone:      rgb("#ff4f00"),
  motorsport: rgb("#e1261c"),
)

// --- helpers ---

#let mono(body, size: 8pt, weight: "regular", fill: grey) = text(
  font: "IBM Plex Mono", size: size, weight: weight, fill: fill, body
)

#let display(body, size: 28pt, weight: "extrabold", fill: ink) = text(
  font: "Archivo", size: size, weight: weight, fill: fill, body
)

// zero-pad a number to 2 digits
#let zpad(n) = if n < 10 { "0" + str(n) } else { str(n) }

// -------------------------------------------------------------------
// COVER
// -------------------------------------------------------------------
#let cover(name, spine, sub) = {
  v(3.2cm)

  // eyebrow
  mono(upper("00 / " + name), size: 9pt, fill: grey)
  v(0.5cm)

  // thick rule
  line(length: 100%, stroke: 3pt + ink)
  v(0.4cm)

  // big display spine
  display(spine, size: 46pt, weight: "extrabold")
  v(0.6cm)

  // bio sub-line
  mono(sub, size: 9.5pt, fill: grey)
  v(0.8cm)

  // second rule
  line(length: 100%, stroke: 1pt + line-c)

  pagebreak()
}

// -------------------------------------------------------------------
// INDEX (one line per project)
// -------------------------------------------------------------------
#let index-page(projects) = {
  mono(upper("index / all projects"), size: 8pt, fill: grey)
  v(0.4cm)
  line(length: 100%, stroke: 3pt + ink)
  v(0.3cm)

  for p in projects {
    let accent = accents.at(p.spokes.at(0).id, default: ink)
    let num    = zpad(p.order)
    let spoke  = upper(p.spokes.at(0).id)

    grid(
      columns: (1.6cm, 1fr, 2.8cm),
      gutter: 0pt,
      mono(num, size: 8.5pt, weight: "semibold", fill: accent),
      text(font: "Archivo", size: 9pt, weight: "semibold", fill: ink)[#p.title],
      align(right, mono(spoke, size: 7.5pt, fill: grey)),
    )
    v(0.18cm)
    line(length: 100%, stroke: 0.5pt + line-c)
    v(0.1cm)
  }

  pagebreak()
}

// -------------------------------------------------------------------
// SPOKE DIVIDER  (printed before each new spoke group)
// -------------------------------------------------------------------
#let spoke-divider(spoke-id, spoke-label) = {
  let accent = accents.at(spoke-id, default: ink)

  // full-bleed accent block via a rect spanning the content width
  rect(
    width: 100%,
    fill: accent,
    inset: (x: 0pt, y: 8pt),
  )[
    #mono(upper("field / " + spoke-label), size: 8pt, fill: white)
  ]
  v(0.3cm)
}

// -------------------------------------------------------------------
// METRIC ROW  (bordered mono grid)
// -------------------------------------------------------------------
#let metric-row(metrics) = {
  let cols = calc.min(metrics.len(), 4)
  rect(
    width: 100%,
    stroke: 1pt + ink,
    inset: 0pt,
  )[
    #grid(
      columns: (1fr,) * cols,
      rows: (auto,),
      stroke: (x, y) => if x > 0 { (left: 0.5pt + ink) } else { none },
      ..metrics.map(m =>
        pad(x: 10pt, y: 8pt)[
          #mono(upper(m.label), size: 7pt, fill: grey) \
          #mono(m.value, size: 12pt, weight: "semibold", fill: ink)
        ]
      )
    )
  ]
}

// -------------------------------------------------------------------
// STACK TAGS  (mono chips inline)
// -------------------------------------------------------------------
#let stack-tags(stack) = {
  let items = if stack.len() > 6 { stack.slice(0, 6) } else { stack }
  for s in items {
    box(
      stroke: 0.5pt + grey,
      inset: (x: 5pt, y: 3pt),
      mono(s, size: 7.5pt, fill: grey),
    )
    h(3pt)
  }
}

// -------------------------------------------------------------------
// PROJECT BLOCK
// -------------------------------------------------------------------
#let project-block(p, accent) = {
  let num    = zpad(p.order)
  let buckets = upper(p.buckets.join(" · "))
  let is-public = p.repo.kind == "public"
  let is-case   = p.repo.kind == "case-study"

  // --- top rule with accent ---
  line(length: 100%, stroke: 3pt + accent)
  v(0.25cm)

  // number + bucket breadcrumb
  mono(num + " / " + buckets, size: 8pt, weight: "semibold", fill: accent)
  v(0.15cm)

  // title
  display(p.title, size: 22pt, weight: "extrabold")
  v(0.15cm)

  // tagline
  text(font: "Inter", size: 10.5pt, fill: rgb("#444444"))[#p.tagline]
  v(0.25cm)

  // stack chips
  stack-tags(p.stack)
  v(0.3cm)

  // metrics block
  metric-row(p.metrics)
  v(0.25cm)

  // role line
  mono(upper("role"), size: 7pt, fill: grey)
  v(0.06cm)
  text(font: "Inter", size: 9pt, fill: ink)[#p.role]
  v(0.12cm)

  // repo / case-study line
  if is-public and "url" in p.repo and p.repo.url != none {
    mono(upper("repo / ") + p.repo.url, size: 7.5pt, fill: grey)
  } else if is-case {
    mono(upper("private · case study (no code link)"), size: 7.5pt, fill: grey)
  } else {
    mono(upper("private repository"), size: 7.5pt, fill: grey)
  }

  v(0.5cm)
}
