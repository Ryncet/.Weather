# ─────────────────────────────────────────────────────────────────────────────
#  facts.py — Weather & nature facts for the dashboard fun-fact widget
#
#  Each entry is a dict with:
#    icon : single emoji displayed alongside the fact
#    text : the fact itself (keep under ~200 chars for clean display)
#
#  To add more facts, just append to the FACTS list below.
#  They are imported into main.py and injected into the HTML at startup.
# ─────────────────────────────────────────────────────────────────────────────

FACTS = [
    # ── Weather extremes ──
    {
        "icon": "⚡",
        "text": "A bolt of lightning is about 5 times hotter than the surface of the Sun — reaching around 30,000 Kelvin.",
    },
    {
        "icon": "🌪️",
        "text": "The average tornado lasts only around 10 minutes, but the longest ever recorded stayed on the ground for over 3.5 hours.",
    },
    {
        "icon": "🌧️",
        "text": "The wettest place on Earth is Mawsynram, India, which receives over 11,800 mm of rain per year.",
    },
    {
        "icon": "🌡️",
        "text": "The highest air temperature ever recorded was 56.7°C (134.1°F) in Furnace Creek, Death Valley, in 1913.",
    },
    {
        "icon": "🧊",
        "text": "The lowest natural temperature ever recorded on Earth's surface was −89.2°C at Vostok Station, Antarctica.",
    },
    {
        "icon": "🌬️",
        "text": "The fastest wind speed ever recorded outside a tornado was 408 km/h at Barrow Island, Australia, in 1996.",
    },
    {
        "icon": "🌊",
        "text": "A tsunami can travel across the ocean at the speed of a commercial jet — up to 800 km/h in deep water.",
    },

    # ── Everyday weather phenomena ──
    {
        "icon": "❄️",
        "text": "No two snowflakes are truly identical — each one forms along a unique path through the atmosphere.",
    },
    {
        "icon": "☀️",
        "text": "On a clear day, sunlight takes about 8 minutes and 20 seconds to travel from the Sun to Earth.",
    },
    {
        "icon": "🌈",
        "text": "A rainbow is always a full circle — the ground just hides the bottom half. You can see a complete ring from an aircraft.",
    },
    {
        "icon": "🌫️",
        "text": "Fog is essentially a cloud that formed at ground level. The only difference between fog and cloud is altitude.",
    },
    {
        "icon": "🌀",
        "text": "Hurricanes in the Northern Hemisphere spin counterclockwise; in the Southern Hemisphere they spin clockwise — thanks to the Coriolis effect.",
    },
    {
        "icon": "🌤️",
        "text": "A cumulus cloud can weigh over 500,000 kg yet stays aloft because the water droplets are tiny enough to be held up by rising warm air.",
    },
    {
        "icon": "🏔️",
        "text": "Weather only occurs in the troposphere — Earth's lowest atmospheric layer, extending about 12 km up.",
    },
    {
        "icon": "💧",
        "text": "Earth's water cycle moves roughly 577,000 km³ of water every year through evaporation, condensation, and precipitation.",
    },

    # ── Nature & climate ──
    {
        "icon": "🌿",
        "text": "A single large tree can transpire over 400 litres of water into the atmosphere on a hot summer day.",
    },
    {
        "icon": "🐘",
        "text": "Elephants can detect rain falling up to 240 km away and will walk toward it even before local clouds appear.",
    },
    {
        "icon": "🐦",
        "text": "Birds can sense changes in barometric pressure with a tiny organ in their inner ear, letting them predict storms hours ahead.",
    },
    {
        "icon": "🌺",
        "text": "Some flowers open and close in response to humidity — a behaviour called nyctinasty — acting as natural weather indicators.",
    },
    {
        "icon": "🦈",
        "text": "Sharks have been observed swimming to deeper water before hurricanes arrive, apparently sensing the drop in barometric pressure.",
    },
    {
        "icon": "🌲",
        "text": "Tree rings record past climate: wide rings mean warm, wet years; narrow rings indicate cold or dry growing seasons.",
    },
    {
        "icon": "🐸",
        "text": "Some frog species can freeze solid in winter and thaw back to life in spring — surviving temperatures well below 0°C.",
    },
    {
        "icon": "🌍",
        "text": "The Amazon rainforest generates its own rainfall — trees release so much water vapour they create 'flying rivers' that feed clouds inland.",
    },

    # ── Atmosphere & space weather ──
    {
        "icon": "🌌",
        "text": "The aurora borealis is caused by charged solar particles colliding with gases in the upper atmosphere, glowing like a giant neon sign.",
    },
    {
        "icon": "☄️",
        "text": "Venus has weather too — its clouds are made of sulfuric acid droplets, and wind speeds at cloud level can reach 360 km/h.",
    },
    {
        "icon": "🪐",
        "text": "Jupiter's Great Red Spot is a storm that has raged for at least 350 years and is wide enough to swallow two Earths.",
    },
    {
        "icon": "🌙",
        "text": "The Moon has almost no weather — no wind, no rain, no clouds — because it has virtually no atmosphere.",
    },
]