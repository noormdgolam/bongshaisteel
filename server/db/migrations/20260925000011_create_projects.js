"use strict";
const { create } = require("../helpers");

/* Completed projects, from the owner's "Bongshai Completed Projects Portfolio"
   (September 2026). Two groups, shown separately and attributed as the
   document does:
     steel        buildings delivered by Bongshai Steel
     engineering  projects delivered by Bongshai Engineering & Construction
   No photos are attached here: the portfolio does not say which picture
   belongs to which project. The owner picks each project's image in the
   admin. Rows are matched by slug, so a second run adds nothing. */

const PROJECTS = [
  {
    "slug": "chattogram-multi-storey-showroom-building",
    "delivered_by": "steel",
    "title": "Multi-storey showroom building",
    "location": "Chattogram",
    "category": "Steel Building",
    "year_label": null,
    "client": null,
    "principal_contractor": null,
    "scope": null,
    "sort_order": 0
  },
  {
    "slug": "dhaka-cantonment-two-storey-building",
    "delivered_by": "steel",
    "title": "Two-storey building",
    "location": "Dhaka Cantonment",
    "category": "Steel Building",
    "year_label": null,
    "client": null,
    "principal_contractor": null,
    "scope": null,
    "sort_order": 1
  },
  {
    "slug": "igs-dhaka-cantonment-pre-engineered-building",
    "delivered_by": "steel",
    "title": "Pre-engineered building",
    "location": "IGS, Dhaka Cantonment",
    "category": "Steel Building",
    "year_label": null,
    "client": null,
    "principal_contractor": null,
    "scope": null,
    "sort_order": 2
  },
  {
    "slug": "igs-building-two-storey-pre-engineered-building",
    "delivered_by": "steel",
    "title": "Two-storey pre-engineered building",
    "location": "IGS Building",
    "category": "Steel Building",
    "year_label": null,
    "client": null,
    "principal_contractor": null,
    "scope": null,
    "sort_order": 3
  },
  {
    "slug": "rajendrapur-cantonment-single-storey-panel-building",
    "delivered_by": "steel",
    "title": "Single-storey panel building",
    "location": "Rajendrapur Cantonment",
    "category": "Steel Building",
    "year_label": null,
    "client": null,
    "principal_contractor": null,
    "scope": null,
    "sort_order": 4
  },
  {
    "slug": "kokonu-sunset-resort-lakeside-resort-cottages",
    "delivered_by": "steel",
    "title": "Lakeside resort cottages",
    "location": "Kokonu Sunset Resort",
    "category": "Steel Building",
    "year_label": null,
    "client": null,
    "principal_contractor": null,
    "scope": null,
    "sort_order": 5
  },
  {
    "slug": "rajabari-gazipur-lakeside-cottages",
    "delivered_by": "steel",
    "title": "Lakeside cottages",
    "location": "Rajabari, Gazipur",
    "category": "Steel Building",
    "year_label": null,
    "client": null,
    "principal_contractor": null,
    "scope": null,
    "sort_order": 6
  },
  {
    "slug": "cumilla-duplex-home",
    "delivered_by": "steel",
    "title": "Duplex home",
    "location": "Cumilla",
    "category": "Steel Building",
    "year_label": null,
    "client": null,
    "principal_contractor": null,
    "scope": null,
    "sort_order": 7
  },
  {
    "slug": "daudkandi-cumilla-single-storey-home",
    "delivered_by": "steel",
    "title": "Single-storey home",
    "location": "Daudkandi, Cumilla",
    "category": "Steel Building",
    "year_label": null,
    "client": null,
    "principal_contractor": null,
    "scope": null,
    "sort_order": 8
  },
  {
    "slug": "badarganj-rangpur-single-storey-home",
    "delivered_by": "steel",
    "title": "Single-storey home",
    "location": "Badarganj, Rangpur",
    "category": "Steel Building",
    "year_label": null,
    "client": null,
    "principal_contractor": null,
    "scope": null,
    "sort_order": 9
  },
  {
    "slug": "gabtali-bogura-single-storey-home",
    "delivered_by": "steel",
    "title": "Single-storey home",
    "location": "Gabtali, Bogura",
    "category": "Steel Building",
    "year_label": null,
    "client": null,
    "principal_contractor": null,
    "scope": null,
    "sort_order": 10
  },
  {
    "slug": "matlab-chandpur-single-storey-home",
    "delivered_by": "steel",
    "title": "Single-storey home",
    "location": "Matlab, Chandpur",
    "category": "Steel Building",
    "year_label": null,
    "client": null,
    "principal_contractor": null,
    "scope": null,
    "sort_order": 11
  },
  {
    "slug": "bhanga-faridpur-single-storey-home-with-roof-deck",
    "delivered_by": "steel",
    "title": "Single-storey home with roof deck",
    "location": "Bhanga, Faridpur",
    "category": "Steel Building",
    "year_label": null,
    "client": null,
    "principal_contractor": null,
    "scope": null,
    "sort_order": 12
  },
  {
    "slug": "purbachal-dhaka-raised-steel-cabin",
    "delivered_by": "steel",
    "title": "Raised steel cabin",
    "location": "Purbachal, Dhaka",
    "category": "Steel Building",
    "year_label": null,
    "client": null,
    "principal_contractor": null,
    "scope": null,
    "sort_order": 13
  },
  {
    "slug": "multistoried-commercial-center-tower",
    "delivered_by": "engineering",
    "title": "Multistoried Commercial Center Tower",
    "location": "Dhaka, Bangladesh",
    "category": "Commercial",
    "year_label": "2025",
    "client": "Al Mannar Properties",
    "principal_contractor": null,
    "scope": "Civil, steel structure, architectural, MEP and fire safety",
    "sort_order": 100
  },
  {
    "slug": "resort-complex-and-dining-pavilion",
    "delivered_by": "engineering",
    "title": "Resort Complex & Dining Pavilion",
    "location": "Bangladesh",
    "category": "Commercial",
    "year_label": "2023",
    "client": "The Wave Resort & Restaurant",
    "principal_contractor": null,
    "scope": "Civil, architectural steel frame, sanitary and complete MEP",
    "sort_order": 101
  },
  {
    "slug": "logistics-warehouse-and-laydown-yards",
    "delivered_by": "engineering",
    "title": "Logistics Warehouse & Laydown Yards",
    "location": "Dhaka Division, Bangladesh",
    "category": "Steel Structure",
    "year_label": "2019",
    "client": "Core Logistics Ltd",
    "principal_contractor": null,
    "scope": "Civil, PEB steel structure, architectural, MEP and water supply",
    "sort_order": 102
  },
  {
    "slug": "100-ft-canal-channel-and-retaining-piling-300-ft-road",
    "delivered_by": "engineering",
    "title": "100 ft Canal Channel & Retaining Piling, 300 ft Road",
    "location": "Purbachal Expressway, Dhaka",
    "category": "Civil & Piling",
    "year_label": "2018",
    "client": "RAJUK",
    "principal_contractor": null,
    "scope": "Precast and cast-in-situ retaining wall piling",
    "sort_order": 103
  },
  {
    "slug": "akij-industrial-peb-factory-buildings",
    "delivered_by": "engineering",
    "title": "Akij Industrial PEB Factory Buildings",
    "location": "Bangladesh",
    "category": "Steel Structure",
    "year_label": "2016",
    "client": "Akij Group",
    "principal_contractor": null,
    "scope": "120,000 sq ft of PEB factory buildings: 75 m clear-span frames, 25-ton crane gantry girders, galvalume standing-seam roofs",
    "sort_order": 104
  },
  {
    "slug": "heavy-industrial-peb-complex",
    "delivered_by": "engineering",
    "title": "Heavy Industrial PEB Complex",
    "location": "Bangladesh",
    "category": "Steel Structure",
    "year_label": "2016",
    "client": "Kazi Farms",
    "principal_contractor": null,
    "scope": "PEB factory buildings and grain silo handling structures, mezzanine decking, insulated galvalume roofing",
    "sort_order": 105
  },
  {
    "slug": "mirpur-housing-development-piling",
    "delivered_by": "engineering",
    "title": "Mirpur Housing Development Piling",
    "location": "Mirpur, Dhaka",
    "category": "Civil & Piling",
    "year_label": "2016",
    "client": "Rakeen Real Estate",
    "principal_contractor": null,
    "scope": "Cast-in-situ and precast deep foundation piling",
    "sort_order": 106
  },
  {
    "slug": "saidpur-military-multipurpose-building",
    "delivered_by": "engineering",
    "title": "Saidpur Military Multipurpose Building",
    "location": "Saidpur, Rangpur Division",
    "category": "Defense",
    "year_label": "2016",
    "client": "Saidpur Cantonment, Bangladesh Army",
    "principal_contractor": null,
    "scope": "Civil, steel structure and architectural finishing",
    "sort_order": 107
  },
  {
    "slug": "cantonment-multipurpose-hall-and-facility",
    "delivered_by": "engineering",
    "title": "Cantonment Multipurpose Hall & Facility",
    "location": "Ghatail, Tangail",
    "category": "Defense",
    "year_label": "2016",
    "client": "Ghatail Cantonment, Bangladesh Army",
    "principal_contractor": null,
    "scope": "Civil, steel structure and architectural works",
    "sort_order": 108
  },
  {
    "slug": "20-storied-commercial-hotel-tower",
    "delivered_by": "engineering",
    "title": "20-Storied Commercial Hotel Tower",
    "location": "Dhaka, Bangladesh",
    "category": "Commercial",
    "year_label": "2015",
    "client": "Premier Hotel Management Ltd",
    "principal_contractor": null,
    "scope": "Deep piling, civil, architectural and steel structure",
    "sort_order": 109
  },
  {
    "slug": "100-mw-power-plant",
    "delivered_by": "engineering",
    "title": "100 MW Power Plant",
    "location": "Katakhali, Rajshahi",
    "category": "Power",
    "year_label": "2014",
    "client": "Energypac Power Generation Ltd",
    "principal_contractor": null,
    "scope": "Heavy civil foundations and structural steel",
    "sort_order": 110
  },
  {
    "slug": "16-storied-commercial-and-medical-center",
    "delivered_by": "engineering",
    "title": "16-Storied Commercial & Medical Center",
    "location": "Chattogram, Bangladesh",
    "category": "Commercial",
    "year_label": "2013",
    "client": "Arab Hospital Ltd",
    "principal_contractor": null,
    "scope": "Civil infrastructure and structural steel framework",
    "sort_order": 111
  },
  {
    "slug": "multipurpose-defense-complex-building",
    "delivered_by": "engineering",
    "title": "Multipurpose Defense Complex Building",
    "location": "Rangpur, Bangladesh",
    "category": "Defense",
    "year_label": "2012",
    "client": "Rangpur Cantonment, Bangladesh Army",
    "principal_contractor": null,
    "scope": "Civil works, steel structure and insulated roof cladding",
    "sort_order": 112
  },
  {
    "slug": "military-indoor-stadium-complex",
    "delivered_by": "engineering",
    "title": "Military Indoor Stadium Complex",
    "location": "Dhaka, Bangladesh",
    "category": "Defense",
    "year_label": "2011",
    "client": "Bangladesh Army",
    "principal_contractor": null,
    "scope": "Civil works and structural steel roof trusses",
    "sort_order": 113
  },
  {
    "slug": "qafco-5-mesaieed-industrial-city",
    "delivered_by": "engineering",
    "title": "QAFCO-5, Mesaieed Industrial City",
    "location": "Mesaieed, Qatar",
    "category": "Steel Structure",
    "year_label": "2008–2010",
    "client": "Qatar Fertiliser Company (QAFCO)",
    "principal_contractor": "Hyundai E&C",
    "scope": "Steel structure fabrication and erection",
    "sort_order": 114
  }
];

exports.up = async function (knex) {
  await create(knex, "projects", (t) => {
    t.increments("id").primary();
    t.string("slug", 120).notNullable().unique();
    t.string("delivered_by", 20).notNullable();   // steel | engineering
    t.string("title", 255).notNullable();
    t.string("category", 60).nullable();
    t.string("year_label", 20).nullable();        // "2016", "2008–2010"
    t.string("client", 255).nullable();
    t.string("principal_contractor", 255).nullable();
    t.string("location", 255).nullable();
    t.string("scope", 500).nullable();
    t.text("summary").nullable();
    t.string("image", 255).nullable();
    t.boolean("published").notNullable().defaultTo(true);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
  });
  for (const p of PROJECTS) {
    if (!(await knex("projects").where({ slug: p.slug }).first("id"))) await knex("projects").insert(p);
  }
  await knex.raw("INSERT INTO site_content (section, data, updated_at) VALUES ('_rev', ?, UTC_TIMESTAMP()) " +
    "ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at)", [String(Date.now())]);
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("projects");
};
