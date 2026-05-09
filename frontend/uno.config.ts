import { defineConfig, presetAttributify, presetIcons, presetWind3 } from 'unocss'

export default defineConfig({
  presets: [
    presetWind3(),
    presetAttributify(),
    presetIcons({
      scale: 1.05,
      warn: true
    })
  ],
  shortcuts: {
    'k-icon': 'inline-block h-4 w-4 align-middle',
    'k-button':
      'inline-flex items-center justify-center gap-1 border border-solid border-[#d9d9d9] bg-white px-2.5 py-1.5 text-[13px] text-[#202938] transition hover:border-[#3b82f6] hover:text-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-55',
    'k-button-primary':
      'inline-flex items-center justify-center gap-1 border border-solid border-[#1677ff] bg-[#1677ff] px-3 py-1.5 text-[13px] text-white transition hover:bg-[#0958d9] disabled:cursor-not-allowed disabled:opacity-55',
    'k-input':
      'border border-solid border-[#d9d9d9] bg-white px-2 py-1.5 text-[13px] text-[#1f2937] outline-none transition focus:border-[#1677ff] focus:shadow-[0_0_0_2px_rgba(22,119,255,.13)]',
    'k-tab':
      'inline-flex h-9 items-center border-0 border-b-2 border-solid border-transparent bg-transparent px-3 text-[13px] text-[#5b6472]',
    'k-tab-active': 'border-[#1677ff] text-[#1677ff]'
  },
  theme: {
    colors: {
      knife: {
        blue: '#1677ff',
        green: '#22a06b',
        orange: '#d97706',
        red: '#d92d20',
        text: '#1f2937',
        muted: '#667085',
        line: '#e5e7eb',
        panel: '#ffffff'
      }
    }
  }
})
