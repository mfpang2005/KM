/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: "#800000", // Deep Red
                "primary-warm": "#A52A2A",
                "primary-light": "#CD5C5C",
                "background-beige": "#FDF5E6",
                "surface-beige": "#F5F5DC",
                "accent-gold": "#D4AF37",
            },
            fontFamily: {
                sans: ['Outfit', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
