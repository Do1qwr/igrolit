<script lang="ts">
  export let id: string;
  export let size = 26;
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2.6"
  stroke-linecap="round"
  stroke-linejoin="round"
  shape-rendering="geometricPrecision"
  aria-hidden="true"
>
  {#if id === 'Steam'}
    <path
      fill="currentColor"
      stroke="none"
      fill-rule="evenodd"
      d="M12 3.4a8.6 8.6 0 1 0 0 17.2 8.6 8.6 0 0 0 0-17.2Zm0 5.2a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8ZM9.6 16.1a1.7 1.7 0 1 0-3.4 0 1.7 1.7 0 0 0 3.4 0Z"
    />
  {:else if id === 'Epic'}
    <path
      fill="currentColor"
      stroke="none"
      fill-rule="evenodd"
      d="M12 3 18.8 5.4v6.7c0 4-3 7.2-6.8 8.8-3.8-1.6-6.8-4.8-6.8-8.8V5.4L12 3Zm-2.7 5.3v7.4h5.4v-1.8h-3.5v-1.3h2.9v-1.8h-2.9V10h3.5V8.3H9.3Z"
    />
  {:else if id === 'GOG'}
    <circle cx="12" cy="12" r="8.1" />
    <path d="M15.7 9.8a4.2 4.2 0 1 0 .5 4.5h-3.7" />
  {:else if id === 'EA'}
    <path
      fill="currentColor"
      stroke="none"
      d="M8.1 7.5h4.1v1.8H10v1.3h2.2v1.8H10v1.3h2.4v1.8H8.1V7.5Zm6.1 0h2.3l2.2 7.7h-2l-.4-1.6h-2l-.4 1.6h-1.9l2.2-7.7Zm.4 4.4h1.4l-.7-2.9-.7 2.9Z"
    />
  {:else if id === 'Ubisoft'}
    <path d="M20.4 12A8.4 8.4 0 1 0 12 20.4" />
    <path d="M15.6 12a3.6 3.6 0 1 0-3.6 3.6" />
  {:else if id === 'Battle.net'}
    <path
      fill="currentColor"
      stroke="none"
      fill-rule="evenodd"
      d="M12 3.1 20.9 12 12 20.9 3.1 12 12 3.1Zm0 4.5L7.6 12l4.4 4.4 4.4-4.4L12 7.6Z"
    />
  {:else if id === 'Custom'}
    <path
      fill="currentColor"
      stroke="none"
      fill-rule="evenodd"
      d="M5.7 5.5h3.9l2.1 2.2h6.6a2.4 2.4 0 0 1 2.4 2.4v7.1a2.4 2.4 0 0 1-2.4 2.4H5.7a2.4 2.4 0 0 1-2.4-2.4V7.9a2.4 2.4 0 0 1 2.4-2.4Zm6.2 5.5v2.3H9.6v1.8h2.3v2.3h1.8v-2.3h2.3v-1.8h-2.3v-2.3h-1.8Z"
    />
  {:else}
    <g fill="currentColor" stroke="none">
      <rect x="3.4" y="3.4" width="7.4" height="7.4" rx="2.1" />
      <rect x="13.2" y="3.4" width="7.4" height="7.4" rx="2.1" />
      <rect x="3.4" y="13.2" width="7.4" height="7.4" rx="2.1" />
      <rect x="13.2" y="13.2" width="7.4" height="7.4" rx="2.1" />
    </g>
  {/if}
</svg>

<style>
  svg {
    display: block;
    flex: none;
  }
</style>

