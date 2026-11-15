<script lang="ts">
  export let metric: string | undefined = undefined;
  export let size = 24;
</script>

{#if metric === 'lock'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="4.8" y="10.2" width="14.4" height="9.6" rx="2.6" />
    <path d="M8.2 10.2V8a3.8 3.8 0 0 1 7.6 0v2.2" />
  </svg>
{:else if metric === 'games'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M7.4 7.6h9.2a4.9 4.9 0 0 1 4.8 4l.8 4.1a2.4 2.4 0 0 1-4.3 1.8l-1.1-1.9H7.2l-1.1 1.9a2.4 2.4 0 0 1-4.3-1.8l.8-4.1a4.9 4.9 0 0 1 4.8-4Z" />
    <path d="M8 11.4v3.2M6.4 13h3.2" />
    <circle cx="16.2" cy="12" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="18" cy="13.9" r="0.9" fill="currentColor" stroke="none" />
  </svg>
{:else if metric === 'hours'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.3V12l3.3 2" />
  </svg>
{:else if metric === 'friends'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="9.4" cy="8.8" r="3.3" />
    <path d="M3.6 19.4a5.9 5.9 0 0 1 11.6 0" />
    <path d="M16 6.1a3.3 3.3 0 0 1 0 5.5" />
    <path d="M17.6 14.3a5.9 5.9 0 0 1 2.9 4.6" />
  </svg>
{:else if metric === 'votesGiven'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3.2" y="10.2" width="3.7" height="9.4" rx="1.6" />
    <path d="M6.9 10.2 11.4 3.3a1.7 1.7 0 0 1 3.1.9v5h4.2a2.1 2.1 0 0 1 2 2.5l-1.2 6a2.1 2.1 0 0 1-2 1.7H6.9" />
  </svg>
{:else if metric === 'votesReceived'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 20.3s-7.4-4.5-7.4-9.4a4.2 4.2 0 0 1 7.4-2.7 4.2 4.2 0 0 1 7.4 2.7c0 4.9-7.4 9.4-7.4 9.4Z" />
  </svg>
{:else if metric === 'reputation'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="9" r="5.3" />
    <path d="M12 6.6l.9 1.8 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3.9-1.8Z" />
    <path d="M8.4 13.5 7 21l5-2.5 5 2.5-1.4-7.5" />
  </svg>
{:else if metric === 'groups'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="7.8" r="2.8" />
    <path d="M6.9 19.7a5.2 5.2 0 0 1 10.2 0" />
    <circle cx="4.4" cy="10.8" r="2" />
    <path d="M1.4 19.4a4 4 0 0 1 4-3.7" />
    <circle cx="19.6" cy="10.8" r="2" />
    <path d="M22.6 19.4a4 4 0 0 0-4-3.7" />
  </svg>
{:else if metric === 'servers'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3.2" y="4.3" width="17.6" height="6.4" rx="2.1" />
    <rect x="3.2" y="13.3" width="17.6" height="6.4" rx="2.1" />
    <path d="M7 7.5h.01M7 16.5h.01" />
    <path d="M11 7.5h5M11 16.5h5" />
  </svg>
{:else if metric === 'days'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3.3" y="5.2" width="17.4" height="15.2" rx="2.7" />
    <path d="M8 3.2v4M16 3.2v4M3.3 10h17.4" />
    <path d="M8.7 15.3l2.2 2.2 4.4-4.4" />
  </svg>
{:else if metric === 'profileFilled'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="2.8" y="5.3" width="18.4" height="13.4" rx="2.7" />
    <circle cx="8.6" cy="10.5" r="2.1" />
    <path d="M5.5 16.2a3.2 3.2 0 0 1 6.2 0" />
    <path d="M14.4 9.9h4.2M14.4 13.5h3" />
  </svg>
{:else if metric === 'hasAvatar'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="8.6" />
    <circle cx="12" cy="10.1" r="2.7" />
    <path d="M6.9 18.5a5.8 5.8 0 0 1 10.2 0" />
  </svg>
{:else if metric === 'twofa'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 3.2l6.9 2.6v5.8c0 4.2-2.9 7.4-6.9 9-4-1.6-6.9-4.8-6.9-9V5.8L12 3.2Z" />
    <circle cx="12" cy="10.7" r="1.9" />
    <path d="M12 12.6v2.8" />
  </svg>
{:else if metric === 'createdGroups'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3.6 18.4h16.8" />
    <path d="M4.5 18.4 3.2 7.6l4.9 3.9L12 5l3.9 6.5 4.9-3.9-1.3 10.8" />
  </svg>
{:else if metric === 'holiday'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3.4" y="9.3" width="17.2" height="10.7" rx="2.3" />
    <path d="M3.4 13.5h17.2M12 9.3v10.7" />
    <path d="M12 9.3c-2.2 0-3.9-.9-3.9-2.3a1.8 1.8 0 0 1 3.2-1.2c.4.7.7 1.9.7 3.5Z" />
    <path d="M12 9.3c2.2 0 3.9-.9 3.9-2.3a1.8 1.8 0 0 0-3.2-1.2c-.4.7-.7 1.9-.7 3.5Z" />
  </svg>
{:else}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 4.1l1.7 4.4 4.4 1.7-4.4 1.7L12 16.3l-1.7-4.4L5.9 10.2l4.4-1.7L12 4.1Z" />
    <path d="M18.3 16.2l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" />
  </svg>
{/if}
