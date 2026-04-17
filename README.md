# Floating Daily To-Do

A floating sidebar Chrome extension for daily task tracking.

## Installation

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the project folder.

The sidebar will appear automatically on every page.

## Usage

Drag the tab on the edge of the browser to reposition the panel. It snaps to any of the four sides and remembers its position.

## Features

**Tasks**
- Add tasks with an optional tag (work / life / learn)
- Click a task to cycle through three statuses: Pending, In Progress, Done
- Set a due date per task — overdue items are highlighted in red; today and tomorrow are labeled accordingly
- Expand any task to add notes (Markdown supported, with a Preview toggle) and sub-tasks

**Interface**
- Light and dark mode
- Pin the panel open so it does not close on mouse-out
- Progress bar showing completed vs total tasks
- Clear all completed tasks in one click

**Weekly export**
- Click the download button to export a Markdown file summarising the current week
- Export includes completion dates, due dates, in-progress items, and tasks carried over from previous weeks
