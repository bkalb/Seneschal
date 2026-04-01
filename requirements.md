# Overview
We're building one-page web app (called "DM Dashboard") for users who "game-master" or referee ongoing tabletop role-playing game campaigns for one or more players. In the course of play, a user may need to reference particular rules, randomly determine in-game environmental conditions or encounters with non-player characters (NPCs) or monsters, refer back to notes from a previous play session, or quickly capture notes related to what has just happened or may happen in future play sessions.

Therefore, this app must be able to display frequently accessed rules and procedures for the game, to generate content from user-provided "random tables" describing possible options and probabilities, and to track in-game events across play sessions and in-game days. Think of it as equal parts planning tool, historical journal, reference page, and in-the-moment procedural generator. 

The MVP needs to be navigable quickly and easily at a glance so that the user can ensure the play session flows smoothly for the players, with options to expand, collapse, or reorder sections on the page so as to prioritize the most vital information at any given moment. 

## Technical considerations
- The app will initially be deployed on a local network server. There are no immediate plans to host it publicly on the internet.
- The app should support multiple user accounts / logins.
- The app will typically be accessed in a full-screen browser window with a roughly 16:9 aspect ratio, but should also be usable in a browser window half that width.
- The app should be designed to be modular where possible and where it makes sense to do so.
- Content input by the user should be saved and persist after refresh and upon return visits.

## Key definitions and concepts
### Random table:
    Essentially an ordered list of possible options, with one option selected at random by simulating the roll of one or more polyhedral dice (3-sided, 4-sided, 6-sided, 8-sided, 10-sided, 12-sided, 20-sided, or 100-sided, or more simply generating a random number within a defined range) and matching the result to the corresponding item in the list. For example, you might roll a 6-sided die on the following table to determine a character's "Ancestry":
    1. Human
    2. Elf
    3. Dwarf
    4. Halfling
    5. Orc
    6. Goblin

    Multiple rolls upon one or more random tables can be combined to produce a greater variety of outcomes. For example, Table A may contain only adjectives and Table B may contain only nouns; rolling on each table produces an adjective-noun combination.

    Random tables can also be used with if/then logic. For example, if the rolled result on the "Ancestry" table is "Orc", then roll on the "Orc Names" table to select a name appropriate for an orc; if the rolled result for "Ancestry" is instead "Elf," then roll on the "Elf Names" table instead.

### Campaign:
    A distinct ongoing game with one or more players who meet over the course of multiple play sessions to continue their characters' progress within the campaign setting.

### Campaign setting:
    The fictional world in which a campaign's characters exist.

### Non-player character:
    Any character encountered within the campaign setting that does not represent and is not controlled by the players.

### Random encounter:
    A spontaneous in-game event involving the players' characters encountering non-player characters or monsters within the campaign setting, typically determined at random and in-the-moment using dice and one or more random tables.

### Dice notation:
    Although this app will not roll actual polyhedral dice, it will need to simulate such rolls. Polyhedral dice are commonly described using dice notation as follows (examples):
    - 1d6 refers to a single 6-sided die
    - 3d10 refers to three 10-sided dice
    - 1d77 refers to a random result between 1 and 77, even though a 77-sided die may not exist in reality

## Core features
### Support for multiple campaigns per user
- A user can configure multiple distinct campaigns within the app, each representing its own ongoing game with its own related content.
- A user can switch between configured campaigns and only see the information/content configured for the selected campaign.
- A user can duplicate, rename, or delete existing campaigns as desired.

### Rules displayed for easy reference
- For a given configured campaign, the user can create, edit, and delete discrete content sections containing rich text (i.e. particular rules or other campaign-specific information), including paragraphs, ordered and unordered lists, simple tables, and hyperlinks.
- These sections are displayed within the app interface, and the user can expand or collapse sections as needed during play.
- The user can rearrange these sections within the interface as desired without reloading the page.

### Procedural generation with user-provided random tables
- For a given configured campaign, the user can import their own random tables and define optional logic for when and how they are used, whether on their own or in combination with other tables.
- Accepted formats for random table files include csv files, markdown, and plain text ordered lists.
- Some random tables map a range of results to the same outcome; for example, on a 1d100 roll, a result of 1, 2, 3, 4, or 5 all means that bandits are encountered.
- Some random tables may include "nested" rolls – for example, on that same 1d100 roll, the result of 3 corresponds to 2d20 bandits. The 2d20 must also be rolled to determine the actual number of bandits encountered.

### In-game calendar and event tracking
- For a given configured campaign, the user can define a calendar for the campaign setting with:
    - customizable lengths (in days) for a year, a month, and a week
    - customizable number and lengths (e.g. starting MM/DD to ending MM/DD) of annual seasons
    - customizable names for seasons, months, and days
    - optional intercalary periods that can be configured to either exist outside of regular months/weeks or overlap with them
- The user can configure the the existence of one or more moons in the campaign setting and define their associated phases (i.e. how many days pass between a new moon and a full moon).
- The user can set an in-game starting date (month/day/year) for the campaign using the configured calendar.
- The calendar is displayed within the app interface, by default showing a view of the current in-game month with the current in-game date highlighted, but also allowing the user to browse past or future months and years.
- The user can add user-facing rich text notes to specific dates on the calendar for the purpose of record keeping, planning, or setting reminders.
- The user can click a button to advance the calendar date by one day, optionally rolling on user-provided random tables to determine daily conditions such as weather or occurrence of random encounters.