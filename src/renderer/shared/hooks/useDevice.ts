import { useState, useEffect } from 'react';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

// 初始化时检测设备类型
function getInitialDeviceState(): { deviceType: DeviceType; isMobile: boolean; windowWidth: number } {
  if (typeof window === 'undefined') {
    return { deviceType: 'desktop', isMobile: false, windowWidth: 1200 };
  }
  
  const width = window.innerWidth;
  const height = window.innerHeight;
  
  // 检测是否为移动设备
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isMobileDevice = isAndroid || isIOS;
  
  // 对于移动设备，竖屏时（高度 > 宽度）认为是移动端
  const isPortrait = height > width;
  const isSmallScreen = width < 768;
  
  if ((isMobileDevice && isPortrait) || isSmallScreen) {
    return { deviceType: 'mobile', isMobile: true, windowWidth: width };
  } else if (width < 1024) {
    return { deviceType: 'tablet', isMobile: false, windowWidth: width };
  } else {
    return { deviceType: 'desktop', isMobile: false, windowWidth: width };
  }
}

export function useDevice() {
  const initialState = getInitialDeviceState();
  const [deviceType, setDeviceType] = useState<DeviceType>(initialState.deviceType);
  const [isMobile, setIsMobile] = useState(initialState.isMobile);
  const [windowWidth, setWindowWidth] = useState(initialState.windowWidth);

  useEffect(() => {
    let ticking = false;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    const checkDevice = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setWindowWidth(width);

      // 检测是否为移动设备
      const isAndroid = /Android/i.test(navigator.userAgent);
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isMobileDevice = isAndroid || isIOS;
      
      // 对于移动设备，使用更宽松的判断
      // 竖屏时（高度 > 宽度），即使宽度超过768也认为是移动端
      const isPortrait = height > width;
      const isSmallScreen = width < 768;
      
      // 移动设备竖屏或小屏幕时，都认为是移动端
      if ((isMobileDevice && isPortrait) || isSmallScreen) {
        setDeviceType('mobile');
        setIsMobile(true);
      } else if (width < 1024) {
        setDeviceType('tablet');
        setIsMobile(false);
      } else {
        setDeviceType('desktop');
        setIsMobile(false);
      }
    };

    const throttledCheck = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          checkDevice();
          ticking = false;
        });
        ticking = true;
      }
    };

    // 防抖：resize 停止后 200ms 再执行一次
    const debouncedCheck = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        checkDevice();
      }, 200);
    };

    const handleResize = () => {
      throttledCheck();
      debouncedCheck();
    };

    checkDevice();

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, []);

  return { deviceType, isMobile, windowWidth };
}

export function useIsMobile() {
  const { isMobile } = useDevice();
  return isMobile;
}
