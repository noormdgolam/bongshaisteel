/* ==========================================================================
   CONTENT SECTIONS — the schemas the generic admin editor renders.
   --------------------------------------------------------------------------
   One entry per repeatable block on the public page. The routes validate
   against these and the templates (T-003) draw their forms from them, so a
   new section is one entry here and a migration — no template work.

   Field types: text | textarea | html | number | checkbox | image
   `max` is the column width (varchar) — text is refused beyond it, never cut.
   `html` fields are rendered raw on the public page, so they are sanitised on
   save (lib/sanitize-html.js).
   ========================================================================== */
"use strict";

const SECTIONS = [
  {
    key: "services", table: "services", title: "Services",
    description: "The cards on the Services page.",
    orderable: true,
    fields: [
      { name: "title", label: "Title", type: "text", required: true, max: 255 },
      { name: "description", label: "Description", type: "html", help: "Basic HTML is allowed: <strong>, <a href>, <br>." },
      { name: "published", label: "Published", type: "checkbox" },
    ],
  },
  {
    key: "faqs", table: "faqs", title: "FAQ",
    description: "Questions on the FAQ page.",
    orderable: true,
    fields: [
      { name: "question", label: "Question", type: "text", required: true, max: 5000 },
      { name: "answer", label: "Answer", type: "html", required: true, help: "Basic HTML is allowed: <strong>, <a href>, <br>." },
      { name: "published", label: "Published", type: "checkbox" },
    ],
  },
  {
    key: "stats", table: "stats", title: "Headline numbers",
    description: "The four figures in the banner under the hero.",
    orderable: true,
    fields: [
      { name: "value", label: "Number", type: "text", required: true, max: 100, help: "As shown, e.g. 72 Models." },
      { name: "label", label: "Label", type: "text", required: true, max: 255 },
    ],
  },
  {
    key: "trust", table: "trust_items", title: "Trust bar",
    description: "The row of reasons under the headline numbers.",
    orderable: true,
    fields: [
      { name: "icon", label: "Icon", type: "text", max: 32, help: "One emoji." },
      { name: "title", label: "Title", type: "text", required: true, max: 255 },
      { name: "text", label: "Text", type: "html", help: "Basic HTML is allowed, including links." },
    ],
  },
  {
    key: "safety", table: "safety_points", title: "Safety points",
    description: "The bullet list on the Health and Safety page. The intro paragraph is under Site copy.",
    orderable: true,
    fields: [
      { name: "text", label: "Point", type: "html", required: true, help: "Basic HTML is allowed." },
    ],
  },
  {
    key: "testimonials", table: "testimonials", title: "Testimonials",
    description: "Shown on the home page; the block stays hidden while nothing is published.",
    orderable: true,
    fields: [
      { name: "quote", label: "What they said", type: "textarea", required: true },
      { name: "author", label: "Name", type: "text", required: true, max: 255 },
      { name: "role", label: "Role or company", type: "text", max: 255 },
      { name: "published", label: "Published", type: "checkbox" },
    ],
  },
  {
    key: "team", table: "team_members", title: "Team",
    description: "Shown at the bottom of the Services page; hidden while nothing is published.",
    orderable: true,
    fields: [
      { name: "name", label: "Name", type: "text", required: true, max: 255 },
      { name: "role", label: "Role", type: "text", max: 255 },
      { name: "bio", label: "Short bio", type: "textarea" },
      { name: "photo", label: "Photo", type: "image", max: 500, help: "A site path like images/team/name.webp." },
      { name: "published", label: "Published", type: "checkbox" },
    ],
  },
  {
    key: "areas", table: "service_areas", title: "Service areas",
    description: "Tags in the contact card; hidden while the list is empty.",
    orderable: true,
    fields: [
      { name: "name", label: "Place", type: "text", required: true, max: 100 },
      { name: "note", label: "Tooltip", type: "text", max: 255, help: "Optional — shown on hover." },
    ],
  },
];

const BY_KEY = new Map(SECTIONS.map((s) => [s.key, s]));

/** The schema as the templates see it — no table names. */
function publicSchema(s) {
  return {
    key: s.key, title: s.title, description: s.description || null, orderable: !!s.orderable,
    fields: s.fields.map(({ name, label, type, required, help }) => ({ name, label, type, required: !!required, help: help || null })),
  };
}

module.exports = { SECTIONS, BY_KEY, publicSchema };
