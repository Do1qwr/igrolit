<script lang="ts">
  export let name: string = 'library';
  export let size = 18;
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.75"
  stroke-linecap="round"
  stroke-linejoin="round"
  shape-rendering="geometricPrecision"
  aria-hidden="true"
>
  {#if name === 'library'}
    <rect x="3.6" y="3.6" width="6.9" height="6.9" rx="1.1" />
    <rect x="13.5" y="3.6" width="6.9" height="6.9" rx="1.1" />
    <rect x="3.6" y="13.5" width="6.9" height="6.9" rx="1.1" />
    <rect x="13.5" y="13.5" width="6.9" height="6.9" rx="1.1" />
  {:else if name === 'plus'}
    <path d="M12 5v14M5 12h14" stroke-width="2" />
  {:else if name === 'star'}
    <path d="M12 3.4l2.65 5.4 5.95.86-4.3 4.2 1.02 5.93L12 17.1l-5.32 2.69 1.02-5.93-4.3-4.2 5.95-.86z" />
  {:else if name === 'steam'}
    <circle cx="12" cy="12" r="8.7" />
    <circle cx="13.5" cy="10.3" r="3.5" />
    <circle cx="8.9" cy="15" r="2.7" fill="currentColor" stroke="none" />
  {:else if name === 'epic'}
    <path d="M12 3.2l7.6 2.5v7c0 4.1-3.1 7.3-7.6 8.9-4.5-1.6-7.6-4.8-7.6-8.9v-7z" />
    <path d="M9.5 8.3v7.4" stroke-width="2.2" />
    <path d="M9.5 8.3h5.2M9.5 12h4.2M9.5 15.7h5.2" stroke-width="2.2" />
  {:else if name === 'gog'}
    <circle cx="12" cy="12" r="8.7" />
    <path d="M16.2 9.5a4.6 4.6 0 1 0 .7 5h-4.1" stroke-width="2" />
  {:else if name === 'custom'}
    <path d="M3.2 7.6a2.2 2.2 0 0 1 2.2-2.2h3.4l2 2.1h8a2.2 2.2 0 0 1 2.2 2.2v7.7a2.2 2.2 0 0 1-2.2 2.2H5.4a2.2 2.2 0 0 1-2.2-2.2z" />
    <path d="M12 11.4v4.8M9.6 13.8h4.8" stroke-width="2" />
  {:else if name === 'gamepad'}
    <path
      d="M7.2 6.9h9.6l3.5 3.4-2.9 8.1-3.4-2.6H9.9l-3.4 2.6-2.9-8.1z"
      stroke-width="2"
    />
    <path d="M7.5 10.1v3M6 11.6h3" stroke-width="2" />
    <path d="M15.2 10.9h.02M17.4 12.6h.02M13.4 13.1h.02" stroke-width="2.5" />
  {:else if name === 'pin'}
    <path d="M9.3 3.6h5.4l-.6 5.2 2.9 2.9H7l2.9-2.9z" />
    <path d="M12 11.7v8.7" />
  {:else if name === 'rocket'}
    <path d="M14.6 3.4l6 6-7.8 7.8-3.1-.7-2.2-2.2-.7-3.1z" />
    <path d="M9.5 14.5l-5.9 5.9" />
    <path d="M15.2 8.8h.02" />
  {:else if name === 'like'}
    <path d="M7 10.6l4.1-6.4a2.3 2.3 0 013.5 2.7l-1.4 3.7h4.5a1.9 1.9 0 011.8 2.5l-1.7 5.3a2.4 2.4 0 01-2.3 1.6H7z" />
    <path d="M7 10.6v10.3" />
  {:else if name === 'dislike'}
    <path d="M7 13.4l4.1 6.4a2.3 2.3 0 003.5-2.7l-1.4-3.7h4.5a1.9 1.9 0 001.8-2.5l-1.7-5.3a2.4 2.4 0 00-2.3-1.6H7z" />
    <path d="M7 13.4V3.1" />
  {:else if name === 'search'}
    <circle cx="10.8" cy="10.8" r="6.3" />
    <path d="M15.6 15.6l4.6 4.6" />
  {:else if name === 'bell'}
    <path d="M6.4 9.8a5.6 5.6 0 0111.2 0c0 4.1 1.4 5.4 1.4 5.4H5s1.4-1.3 1.4-5.4z" />
    <path d="M10.2 18.2a2 2 0 003.6 0" />
  {:else if name === 'ghost'}
    <path d="M5.4 20V11a6.6 6.6 0 0113.2 0v9l-2.2-1.8-2.2 1.8-2.2-1.8L9.8 20l-2.2-1.8z" />
    <path d="M9.8 10.2h.02M14.2 10.2h.02" />
  {:else if name === 'book'}
    <path d="M12 6.2c-1.6-1.2-3.6-1.8-6-1.8v13c2.4 0 4.4.6 6 1.8 1.6-1.2 3.6-1.8 6-1.8v-13c-2.4 0-4.4.6-6 1.8z" />
    <path d="M12 6.2v13" />
  {:else if name === 'refresh'}
    <path d="M20 12a8 8 0 10-2.6 5.9" />
    <path d="M20 5.5v5h-5" />
  {:else if name === 'save'}
    <path d="M4 4h13l3 3v13H4z" />
    <path d="M8 4v6h7V4" />
    <path d="M7 20v-6h10v6" />
  {:else if name === 'curtain'}
    <rect x="3.2" y="3.8" width="17.6" height="16.4" rx="1.4" />
    <path d="M9 3.8v16.4" />
    <path d="M9 8h5M9 12h5" />
  {:else if name === 'settings'}
    <circle cx="12" cy="12" r="3.1" />
    <path d="M19.4 14.2a1.4 1.4 0 00.3 1.5l.1.1a1.7 1.7 0 11-2.4 2.4l-.1-.1a1.4 1.4 0 00-1.5-.3 1.4 1.4 0 00-.9 1.3v.2a1.7 1.7 0 11-3.4 0v-.1a1.4 1.4 0 00-.9-1.3 1.4 1.4 0 00-1.5.3l-.1.1a1.7 1.7 0 11-2.4-2.4l.1-.1a1.4 1.4 0 00.3-1.5 1.4 1.4 0 00-1.3-.9h-.2a1.7 1.7 0 110-3.4h.1a1.4 1.4 0 001.3-.9 1.4 1.4 0 00-.3-1.5l-.1-.1a1.7 1.7 0 112.4-2.4l.1.1a1.4 1.4 0 001.5.3h.1a1.4 1.4 0 00.9-1.3v-.2a1.7 1.7 0 013.4 0v.1a1.4 1.4 0 00.9 1.3 1.4 1.4 0 001.5-.3l.1-.1a1.7 1.7 0 112.4 2.4l-.1.1a1.4 1.4 0 00-.3 1.5v.1a1.4 1.4 0 001.3.9h.2a1.7 1.7 0 010 3.4h-.1a1.4 1.4 0 00-1.3.9z" />
  {:else if name === 'users'}
    <circle cx="9" cy="8.2" r="3.1" />
    <path d="M3.6 19.2a5.6 5.6 0 0110.8 0" />
    <path d="M15.6 5.4a3.1 3.1 0 010 5.9" />
    <path d="M16.5 14.2a5.4 5.4 0 013.9 5" />
  {:else if name === 'group'}
    <circle cx="8.4" cy="8.6" r="3" />
    <path d="M3.4 19a5 5 0 0110 0" />
    <circle cx="16.8" cy="9.6" r="2.2" />
    <path d="M14.8 15.4a4 4 0 015.8 3.6" />
  {:else if name === 'user'}
    <circle cx="12" cy="8.4" r="3.6" />
    <path d="M5 19.4a7 7 0 0114 0" />
  {:else if name === 'inbox'}
    <path d="M4 5.2h16v13.6H4z" />
    <path d="M4 12.6h4l1.6 2.2h4.8l1.6-2.2h4" />
  {:else if name === 'send'}
    <path d="M20 4L3.8 10.6l6.1 2.3 2.2 6.1z" />
    <path d="M20 4l-8.2 8.3" />
  {:else if name === 'shield'}
    <path d="M12 3.6l6.8 2.7v5.2c0 4.1-2.9 7.2-6.8 8.9-3.9-1.7-6.8-4.8-6.8-8.9V6.3z" />
    <path d="M9.2 12.1l1.9 1.9 3.8-3.9" />
  {:else if name === 'support'}
    <circle cx="12" cy="12" r="8.2" />
    <circle cx="12" cy="12" r="3.4" />
    <path d="M5.9 5.9l4.3 4.3M13.8 13.8l4.3 4.3M18.1 5.9l-4.3 4.3M10.2 13.8l-4.3 4.3" />
  {:else if name === 'server'}
    <rect x="3.4" y="3.4" width="17.2" height="7.1" rx="1.2" />
    <rect x="3.4" y="13.5" width="17.2" height="7.1" rx="1.2" />
    <path d="M7 7h.01M7 17h.01" />
    <path d="M11 7h6M11 17h6" />
  {:else if name === 'trophy'}
    <path d="M8.2 4h7.6v2.4H8.2z" />
    <path d="M8.2 6.4H5.2a2.5 2.5 0 002.4 3.3h1.1" />
    <path d="M15.8 6.4h3a2.5 2.5 0 01-2.4 3.3h-1.1" />
    <path d="M12 9.7v2.3" />
    <path d="M8.9 17.4h6.2" />
    <path d="M9.5 13.6l-.4 3.8h5.8l-.4-3.8z" />
    <path d="M7.4 20h9.2" />
  {:else if name === 'wallet'}
    <rect x="3.6" y="5.6" width="16.8" height="13" rx="1.6" />
    <path d="M3.6 9.4h16.8" />
    <path d="M15.4 13.6h2.6" />
  {:else if name === 'crown'}
    <path d="M4 17.6h16" />
    <path d="M5.4 17.6L4 8l4.6 3.4L12 5.6l3.4 5.8L20 8l-1.4 9.6z" />
  {:else if name === 'chart'}
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <path d="M8 16v-4M12 16V8M16 16v-6" />
  {:else if name === 'logout'}
    <path d="M14 4H6a1.6 1.6 0 00-1.6 1.6v12.8A1.6 1.6 0 006 20h8" />
    <path d="M10.5 12h9" />
    <path d="M16.4 8.6L20 12l-3.6 3.4" />
  {:else if name === 'copy'}
    <rect x="8" y="8" width="11" height="11" rx="1.6" />
    <path d="M5 15.6V5.6A1.6 1.6 0 016.6 4h10" />
  {:else if name === 'heart'}
    <path d="M12 20s-7-4.4-9.2-8.3C1.3 8.6 2.9 5.2 6.2 5.2c1.9 0 3.4 1 4 2.2.6-1.2 2.1-2.2 4-2.2 3.3 0 4.9 3.4 3.4 6.5C19 15.6 12 20 12 20z" />
  {:else if name === 'eye'}
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.6" />
  {:else if name === 'image'}
    <rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2" />
    <circle cx="8.6" cy="9.6" r="1.6" />
    <path d="M4.2 17.6l4.9-4.6 3.4 3.1 3-2.7 4.3 4.2" />
  {:else if name === 'smile'}
    <circle cx="12" cy="12" r="8.4" />
    <path d="M8.4 14.2a4.4 4.4 0 007.2 0" />
    <path d="M9.2 9.6h.01M14.8 9.6h.01" />
  {:else if name === 'message'}
    <path d="M20.4 12.4c0 3.9-3.8 7-8.4 7a10 10 0 01-2.6-.34L4.6 20.6l1.2-3.6A6.6 6.6 0 013.6 12.4c0-3.9 3.8-7 8.4-7s8.4 3.1 8.4 7z" />
  {:else if name === 'ea'}
    <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="4.6" />
    <path d="M8.1 8.1v7.8M8.1 8.1h3.3M8.1 12h2.7M8.1 15.9h3.3" stroke-width="2.1" />
    <path d="M14.1 15.9l2.15-7.8 2.15 7.8M14.95 13.3h2.6" stroke-width="2.1" />
  {:else if name === 'ubisoft'}
    <path d="M10.4 20.3A8.4 8.4 0 1 1 20.3 10.4" stroke-width="2.1" />
    <path d="M12.7 16.7A4.6 4.6 0 1 0 16.7 12.7" stroke-width="2.1" />
    <circle cx="13.6" cy="13.6" r="1.2" fill="currentColor" stroke="none" />
  {:else if name === 'battlenet'}
    <path d="M12 3.1l8.9 8.9-8.9 8.9L3.1 12z" fill="currentColor" stroke="none" opacity="0.2" />
    <path d="M12 3.1l8.9 8.9-8.9 8.9L3.1 12z" />
    <path d="M12 7.3l4.7 4.7-4.7 4.7-4.7-4.7z" fill="currentColor" stroke="none" opacity="0.8" />
  {:else if name === 'minimize'}
    <path d="M4 12h16" stroke-width="2" />
  {:else if name === 'maximize'}
    <rect x="4.6" y="4.6" width="14.8" height="14.8" rx="2" stroke-width="2" />
  {:else if name === 'restore'}
    <rect x="4.2" y="7.6" width="12.2" height="12.2" rx="1.8" stroke-width="2" />
    <path d="M7.8 4.2h10a2 2 0 0 1 2 2v10" stroke-width="2" />
  {:else if name === 'close'}
    <path d="M6 6l12 12M18 6L6 18" />
  {/if}
</svg>

<style>
  svg {
    display: block;
    flex: none;
  }
</style>
