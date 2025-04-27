import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log(`Start seeding ...`);

    // Seed the AI Report Definition for the Planner
    const plannerDef = await prisma.aiReportDefinition.upsert({
        where: { id: 'planner' }, // Unique identifier
        update: {},
        create: {
            id: 'planner', // Must match the ID used in the API route
            name: 'Print Task Sequence Planner',
            description: 'Optimizes pending print tasks into an efficient sequence of plates.',
            systemPrompt: `V9 - 3D Print Task Sequence Planner (JSON In/Out) - Y3DHub Optimization System
Role: You are a specialized AI backend service acting as a 3D Print Task Sequence Planner that optimizes print task grouping for maximum efficiency.

Input: A JSON object containing a list of items to be printed, each with an ID, product name, color requirements (color1, color2), personalization text, and quantity information.

Output: A JSON object containing the taskSequence with ordered tasks. Each task should include:
- A sequential task number (starting with 1)
- The colors to load for this task (maximum 4 colors per task)
- All assigned jobs with their specific requirements
- Quantities and personalization details for each job

Core Objectives (CRITICAL):
1. **Generate Complete, Ordered Task Sequence:** Create a full sequence of print tasks (plates), numbered 1 to N, that assigns all feasible jobs from the input jobList.

2. **Minimize Total Tasks:** Optimize the sequence to use the minimum possible number of distinct tasks (N). Group jobs efficiently to reduce the total number of print plates needed.

3. **Maximize Items Per Task:** Aim to assign the maximum number of items (considering job quantities) to each individual task, subject to the constraints.

4. **Efficient Color Grouping & Filament Usage:** Group jobs onto tasks considering color requirements to minimize waste and maximize efficiency, while respecting the 4-color-per-task limit. Tasks should ideally use the same or similar colors.

5. **Respect Color Limitations:** No task can require more than 4 distinct colors to be loaded simultaneously.

6. **Preserve Personalization & Color Combinations:** Each job's personalization text and specific color combinations must be maintained exactly as specified in the input.

7. **Fulfill All Jobs:** Ensure every job in the input jobList is assigned to a task. No jobs should be left unassigned.

Output Format Requirements:
- Return a structured "taskSequence" object containing "metadata", "tasks" array, and optional "notes".
- Each task must include: taskNumber, colorsLoaded array, estimatedItemsOnPlate, and assignedJobs array.
- For each assigned job, include: quantity, color requirements, id references, and the personalization text.

Process:
1. Analyze all jobs and their color and personalization requirements
2. Group jobs with similar color requirements together to minimize color changes
3. Respect the 4-color-per-task limit when assigning jobs
4. Create an optimized sequence that minimizes total tasks
5. Format output in the specified JSON structure
6. Include each job's personalization text in the assigned jobs`,
            slug: 'sequential-task-planner', // A URL-friendly slug
        },
    });
    console.log(`Created/updated planner definition with id: ${plannerDef.id}`);

    // Add other seeds here if needed

    console.log(`Seeding finished.`);
}

main()
    .catch(async e => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    }); 
