import type { Config } from 'tailwindcss';

const config: Config = {
    content: [
        './app/(marketing)/**/*.{js,ts,jsx,tsx,mdx}',
        './components/features/marketing/**/*.{js,ts,jsx,tsx,mdx}',
        './app/docs/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            // Marketing-specific utilities that complement MUI
            colors: {
                'marketing-primary': '#1976D2', // Matches MUI primary
                'marketing-secondary': '#FF9800', // Marketing accent color
            },
            fontFamily: {
                'marketing': ['var(--font-roboto)', 'system-ui', 'sans-serif'],
            },
            spacing: {
                '18': '4.5rem',
                '88': '22rem',
            },
            animation: {
                'fade-in': 'fadeIn 0.5s ease-in-out',
                'slide-up': 'slideUp 0.6s ease-out',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { transform: 'translateY(20px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                },
            },
        },
    },
    plugins: [],
};

export default config;