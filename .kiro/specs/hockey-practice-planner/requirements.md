# Requirements Document

## Introduction

The Hockey Practice Planner feature enables coaches and team administrators to design practice sessions using a visual rink board, create plays and drills, and share these plans with team members. This feature transforms practice planning from static documents or whiteboard photos into an interactive, shareable digital experience that team members can access from any device.

## Glossary

- **Practice Planner**: The system component that allows coaches to create, edit, and manage practice session plans
- **Rink Board**: A visual representation of a hockey rink where coaches can place players, draw plays, and annotate drills
- **Play**: A specific tactical sequence or drill designed on the rink board with player positions and movement paths
- **Practice Session**: A scheduled practice event that includes one or more plays and drills with timing and instructions
- **Coach**: A team administrator or user with permission to create and edit practice plans
- **Team Member**: A player or staff member who can view shared practice plans

## Requirements

### Requirement 1

**User Story:** As a coach, I want to create practice plans using a visual rink board, so that I can design drills and plays before practice

#### Acceptance Criteria

1. WHEN the Coach accesses the practice planner, THE Practice Planner SHALL display a visual hockey rink board with standard ice hockey dimensions and markings
2. WHEN the Coach selects a player icon, THE Practice Planner SHALL allow placement of the player icon on any position within the rink board
3. WHEN the Coach draws on the rink board, THE Practice Planner SHALL capture the drawing path and display it as a line with directional arrows
4. WHEN the Coach adds text annotations, THE Practice Planner SHALL place the text at the specified location on the rink board
5. WHEN the Coach saves a play, THE Practice Planner SHALL store the play with all player positions, movement paths, and annotations

### Requirement 2

**User Story:** As a coach, I want to organize multiple plays into a practice session, so that I can structure a complete practice with timing and instructions

#### Acceptance Criteria

1. WHEN the Coach creates a practice session, THE Practice Planner SHALL allow the Coach to add a title, date, and duration
2. WHEN the Coach adds plays to a session, THE Practice Planner SHALL display the plays in sequential order
3. WHEN the Coach assigns time to each play, THE Practice Planner SHALL validate that the total time does not exceed the session duration
4. WHEN the Coach adds instructions to a play, THE Practice Planner SHALL store the text instructions with the play
5. WHEN the Coach reorders plays, THE Practice Planner SHALL update the sequence and maintain all play data

### Requirement 3

**User Story:** As a coach, I want to share practice plans with my team, so that players can review the drills before practice

#### Acceptance Criteria

1. WHEN the Coach shares a practice session, THE Practice Planner SHALL make the session accessible to all Team Members of the associated team
2. WHEN a Team Member views a shared practice session, THE Practice Planner SHALL display all plays in the correct sequence with timing and instructions
3. WHEN a Team Member views a play, THE Practice Planner SHALL render the rink board with all player positions, movements, and annotations
4. WHERE the practice session is updated after sharing, THE Practice Planner SHALL reflect the changes to all Team Members immediately
5. WHEN a Team Member accesses the practice plan on mobile, THE Practice Planner SHALL display the rink board and plays in a mobile-optimized layout

### Requirement 4

**User Story:** As a coach, I want to save and reuse plays across different practice sessions, so that I can build a library of drills

#### Acceptance Criteria

1. WHEN the Coach saves a play to the library, THE Practice Planner SHALL store the play independently from any specific practice session
2. WHEN the Coach accesses the play library, THE Practice Planner SHALL display all saved plays with preview thumbnails
3. WHEN the Coach selects a play from the library, THE Practice Planner SHALL allow the Coach to add it to the current practice session
4. WHEN the Coach edits a library play within a session, THE Practice Planner SHALL create a copy without modifying the original library play
5. WHEN the Coach deletes a play from the library, THE Practice Planner SHALL remove it from the library while preserving instances in existing practice sessions

### Requirement 5

**User Story:** As a coach, I want to use different drawing tools on the rink board, so that I can clearly communicate player movements and drill patterns

#### Acceptance Criteria

1. WHEN the Coach selects the line tool, THE Practice Planner SHALL allow drawing straight lines with directional arrows
2. WHEN the Coach selects the curve tool, THE Practice Planner SHALL allow drawing curved paths with directional arrows
3. WHEN the Coach selects different colors, THE Practice Planner SHALL apply the selected color to subsequent drawings
4. WHEN the Coach selects the eraser tool, THE Practice Planner SHALL remove individual drawing elements when clicked
5. WHEN the Coach uses the clear function, THE Practice Planner SHALL remove all drawings while preserving player positions

### Requirement 6

**User Story:** As a team member, I want to receive notifications when practice plans are shared, so that I can review them before practice

#### Acceptance Criteria

1. WHEN the Coach shares a practice session, THE Practice Planner SHALL send email notifications to all Team Members
2. WHEN a Team Member receives the notification, THE Practice Planner SHALL include a direct link to view the practice session
3. WHEN the Coach updates a shared practice session, THE Practice Planner SHALL send update notifications to Team Members
4. WHERE a Team Member has notification preferences disabled, THE Practice Planner SHALL not send email notifications to that Team Member
5. WHEN a Team Member clicks the notification link, THE Practice Planner SHALL display the practice session without requiring additional navigation
