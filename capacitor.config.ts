import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.moyuan.lingbi',
  appName: '墨渊灵笔',
  webDir: 'build/renderer',
  server: {
    androidScheme: 'https',
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#030712',
      androidSpinnerStyle: 'large',
      spinnerColor: '#7c3aed',
    },
  },
};

export default config;
