# Y3DHub Print Task Planner Enhancement Plan

## Overview

This document outlines the plan for enhancing the Print Task Planner system to better optimize 3D printing workflows and improve the UI for displaying task information. The system will automatically fetch print tasks from the database without requiring manual input.

## Core Objectives

1. **Generate Complete, Ordered Task Sequences**: Create sequences of print tasks (plates) that efficiently assign all jobs from the database
2. **Minimize Total Tasks**: Optimize grouping to use the minimum number of distinct tasks
3. **Maximize Items Per Task**: Assign maximum items to each task within constraints
4. **Efficient Color Grouping**: Group jobs by color requirements to minimize waste and filament changes
5. **Display Personalization Text**: Show the custom text for each item in the task display

## Implementation Plan

### 1. Fix Type Errors ✅

- Fix Prisma type errors in the API routes

### 2. Enhance AI Prompt for Task Planning ✅

- Update the system prompt in `/api/ai/reports/planner/route.ts`
- Add detailed objectives for sorting and optimizing tasks
- Include instructions for extracting and displaying personalization text
- Make sure each task has explicit color requirements

### 3. Update Data Models ✅

- Update `PrintItem` to include:
  - Custom text for personalization
  - Specific color1 and color2 fields
  - Quantity information
  - Product name/description

### 4. Upgrade UI Components ✅

- Modify `PrintTaskCard.tsx` to display tasks in the requested format:

  ```
  Task 1:
  
  Colours to Load: Light Blue, Blue, Yellow, White

  Tasks:
  2 Yellow, White, Gracie
  1 Light Blue, Blue, Robbie
  ```

- Improve the task timeline sidebar for easier navigation
- Add summary statistics for the overall plan

### 5. Create Database Integration for Print Tasks

- Create API endpoint to fetch print tasks directly from the database
- Group tasks by color requirements automatically
- Update the planner page to load tasks automatically without manual input
- Add refresh button to re-fetch task data and re-optimize as needed

### 6. Create Redirect for `/ai/planner` ✅

- Ensure `/ai/planner` redirects to the correct planner page

### 7. Test and Refine

- Test with real database data
- Validate optimization results
- Get user feedback

## UI Components to Modify

1. **TaskPage.tsx**: Parent component for planner UI
2. **PrintTaskCard.tsx**: Display for individual tasks (completed)
3. **TaskTimeline.tsx**: Sidebar navigation (completed)
4. **ColorChip.tsx**: Showing color pills with improved visibility (completed)
5. **PlannerPage.tsx**: Update to fetch data automatically instead of requiring manual input

## Database Integration

The planner will integrate directly with the PrintOrderTask database table to:

- Fetch all pending print tasks
- Extract personalization text, colors, and other details
- Group related tasks together based on color requirements
- Generate an optimized printing sequence

## Expected Outcomes

1. Automatic task loading and optimization without manual input
2. More efficient task planning with fewer total tasks
3. Clearer display of personalization text and color requirements
4. Better visibility of task details in dark theme UI
5. Improved user workflow for print operators
