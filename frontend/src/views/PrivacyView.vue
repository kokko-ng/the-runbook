<script setup lang="ts">
import AppFooter from '@/components/AppFooter.vue'
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <main class="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <p class="eyebrow mb-2">The Runbook</p>
      <h1 class="mb-6 text-2xl font-semibold">Privacy</h1>

      <div class="prose-beat space-y-5">
        <p>
          The Runbook is free and playable without an account. This page explains what the game
          stores and why, in line with Singapore's Personal Data Protection Act.
        </p>

        <section>
          <h2 class="mb-1 font-sans text-base font-semibold">What stays on your device</h2>
          <p>
            Your saved game lives in your browser's local storage: where you are in the story,
            your standing, skill points, perks, the state of the architecture map, and the choices
            you have made. It never leaves your device unless you create an account and turn on
            save sync. Deleting it from the start screen removes it immediately and permanently.
          </p>
        </section>

        <section>
          <h2 class="mb-1 font-sans text-base font-semibold">What the server records</h2>
          <p>
            The game sends anonymous gameplay events so we can tell which encounters teach badly:
            an encounter id, whether it was cleared first try, and a random identifier generated
            in your browser. That identifier is not linked to a person, an email address, or an IP
            address we retain, and it cannot be used to contact you. No free-text input is
            collected anywhere in the game, because the game never asks you to type anything.
          </p>
        </section>

        <section>
          <h2 class="mb-1 font-sans text-base font-semibold">If you create an account</h2>
          <p>
            An account exists for one purpose: syncing your save between devices. It stores your
            email address, a hashed password, and your save data. Your email is used to sign in
            and to reset your password. It is not used for marketing and is not sold or shared.
            You can delete your account and its data by contacting us.
          </p>
        </section>

        <section>
          <h2 class="mb-1 font-sans text-base font-semibold">Cookies</h2>
          <p>
            No advertising or tracking cookies are used. A session cookie is set only when you
            sign in.
          </p>
        </section>

        <section>
          <h2 class="mb-1 font-sans text-base font-semibold">Contact</h2>
          <p>
            For access, correction, or deletion requests, or any question about this page, get in
            touch through the address listed on the repository.
          </p>
        </section>
      </div>

      <RouterLink to="/" class="btn btn-quiet mt-8">Back to the start</RouterLink>
    </main>
    <AppFooter />
  </div>
</template>
