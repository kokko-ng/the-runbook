<script setup lang="ts">
import AppFooter from '@/components/AppFooter.vue'
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <main class="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <p class="eyebrow mb-2">The Runbook</p>
      <h1 class="mb-6 text-2xl font-semibold">Terms of use</h1>

      <div class="prose-beat space-y-5">
        <section>
          <h2 class="mb-1 font-sans text-base font-semibold">No affiliation with Microsoft</h2>
          <p>
            The Runbook is an independent study aid produced by an unrelated third party. It is
            not affiliated with, endorsed by, sponsored by, or approved by Microsoft Corporation.
            Microsoft, Azure, and the exam codes AZ-104 and AZ-305 are trademarks of the Microsoft
            group of companies and are used here only to describe what the material covers.
          </p>
        </section>

        <section>
          <h2 class="mb-1 font-sans text-base font-semibold">What this is and is not</h2>
          <p>
            The game teaches material that appears in Microsoft's published exam study guides. It
            is not a practice exam, does not reproduce exam questions, and does not guarantee that
            you will pass anything. Microsoft revises its exam objectives periodically; content
            here is mapped against the study guides as published on the date shown in the skills
            drawer, and may lag a revision.
          </p>
        </section>

        <section>
          <h2 class="mb-1 font-sans text-base font-semibold">Accuracy</h2>
          <p>
            Scenarios, command output, and explanations are written to be realistic, but they are
            fiction with a teaching purpose. Do not run commands from the game against a
            production environment on the assumption that the output will match. Always check
            Microsoft's own documentation before acting on anything you learn here.
          </p>
        </section>

        <section>
          <h2 class="mb-1 font-sans text-base font-semibold">Cost and availability</h2>
          <p>
            The game is free in full. There are no payments, subscriptions, or paid tiers, and no
            part of the content is withheld behind one. It is offered as is, with no guarantee of
            availability, and it may change or stop being hosted at any time.
          </p>
        </section>

        <section>
          <h2 class="mb-1 font-sans text-base font-semibold">Fiction</h2>
          <p>
            Meridian Logistics, its staff, its systems, and its incidents are invented. Any
            resemblance to a real company or person is coincidental.
          </p>
        </section>
      </div>

      <RouterLink to="/" class="btn btn-quiet mt-8">Back to the start</RouterLink>
    </main>
    <AppFooter />
  </div>
</template>
