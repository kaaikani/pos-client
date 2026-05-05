import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
    turbopack: { root: path.resolve(__dirname, '../..') },
    cacheComponents: true,
    allowedDevOrigins: ['192.168.31.36', '*.local'],
    images: {
        // This is necessary to display images from your local Vendure instance
        dangerouslyAllowLocalIP: true,
        remotePatterns: [
            {
                hostname: 'readonlydemo.vendure.io',
            },
            {
                hostname: 'demo.vendure.io'
            },
            {
                hostname: 'localhost'
            },
            {
                hostname: '127.0.0.1'
            }
        ],
    },
    experimental: {
        rootParams: true
    }
};

export default nextConfig;