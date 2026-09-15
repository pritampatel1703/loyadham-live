import React from 'react';

/* ═══════════════════════════════════════════════════════════
   PHOTOREALISTIC BROADCAST GRAPHICS RENDERER (3D RENDERED)
   ═══════════════════════════════════════════════════════════
   Uses AI-rendered photorealistic 3D graphic frames (Cinema 4D /
   Blender / After Effects Element 3D quality) as background images.
   Dynamic text is overlaid on top of the rendered frames.
   
   Asset Library:
   - lt_chrome_glass.jpg     — Metallic chrome & holographic lower third
   - lt_sacred_gold.jpg      — 24K gold filigree Om sacred lower third
   - lt_news_modern.jpg      — Frosted glass blue neon news lower third
   - lt_elegant_luxury.jpg   — Rose gold marble art deco lower third
   - lt_sports_scorebug.jpg  — Carbon fiber HUD sports scoreboard
   - banner_breaking_news.jpg — 3D red metallic breaking news banner
   - ticker_bar_premium.jpg  — Chrome LED ticker bar
   - fullscreen_title_card.jpg — Sacred geometry cinematic title card
   - logo_bug_corner.jpg     — Chrome glass channel bug frame
   ═══════════════════════════════════════════════════════════ */

const GRAPHICS_BASE = '/graphics';

// Map graphic categories to rendered asset filenames
const LOWER_THIRD_ASSETS = {
  religious: `${GRAPHICS_BASE}/lt_sacred_gold.jpg`,
  sacred: `${GRAPHICS_BASE}/lt_sacred_gold.jpg`,
  keynote: `${GRAPHICS_BASE}/lt_elegant_luxury.jpg`,
  luxury: `${GRAPHICS_BASE}/lt_elegant_luxury.jpg`,
  news: `${GRAPHICS_BASE}/lt_news_modern.jpg`,
  esports: `${GRAPHICS_BASE}/lt_chrome_glass.jpg`,
  sports: `${GRAPHICS_BASE}/lt_chrome_glass.jpg`,
  social: `${GRAPHICS_BASE}/lt_news_modern.jpg`,
  default: `${GRAPHICS_BASE}/lt_chrome_glass.jpg`,
};

export default function BroadcastGraphicItem({ gfx, scale = 1, isPreview = false }) {
  if (!gfx) return null;
  const l = gfx.layers || {};
  const getText = (key, fallback = '') => {
    const val = l[key];
    if (val && typeof val === 'object' && val.text !== undefined) return val.text;
    if (typeof val === 'string') return val;
    return fallback;
  };

  const isReligious = gfx.category === 'religious' || gfx.id?.includes('satsang') || gfx.id?.includes('verse');
  const isEsports = gfx.category === 'esports' || gfx.id?.includes('cyber') || gfx.id?.includes('matchup');
  const isKeynote = gfx.category === 'keynote' || gfx.id?.includes('executive') || gfx.id?.includes('event');
  const isNews = gfx.category === 'news' || gfx.id?.includes('news') || gfx.id?.includes('breaking') || gfx.id?.includes('alert');
  const isSocial = gfx.category === 'social' || gfx.id?.includes('social');
  const isSports = gfx.category === 'sports' || gfx.id?.includes('score');

  // Determine which rendered asset to use for lower thirds
  const getLTAsset = () => {
    if (isReligious) return LOWER_THIRD_ASSETS.religious;
    if (isKeynote) return LOWER_THIRD_ASSETS.keynote;
    if (isNews) return LOWER_THIRD_ASSETS.news;
    if (isEsports) return LOWER_THIRD_ASSETS.esports;
    if (isSocial) return LOWER_THIRD_ASSETS.social;
    return LOWER_THIRD_ASSETS.default;
  };

  // ═══════════════════════════════════════════════════════════
  // 1. LOWER THIRDS — Photorealistic 3D Rendered Frames
  // ═══════════════════════════════════════════════════════════
  if (gfx.type === 'lower-third') {
    const badgeRaw = getText('badge');
    const badge = badgeRaw ? badgeRaw.replace(/^🕉️\s*/, '').trim() : '';
    const title = getText('title', 'Speaker Name');
    const subtitle = getText('subtitle', 'Title / Designation');
    const assetUrl = getLTAsset();

    // Get text color based on asset type
    const titleColor = isReligious ? '#1a0a00' : isKeynote ? '#2d2d2d' : '#ffffff';
    const subtitleColor = isReligious ? '#3d1a00' : isKeynote ? '#555555' : '#e2e8f0';
    const titleShadow = isReligious
      ? '0 1px 3px rgba(255,200,100,0.5)'
      : isKeynote
      ? '0 1px 2px rgba(255,255,255,0.3)'
      : '0 2px 8px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.5)';

    return (
      <div style={{
        position: 'absolute',
        bottom: isPreview ? '6%' : '8%',
        left: isPreview ? '3%' : '4%',
        transform: `scale(${scale})`,
        transformOrigin: 'bottom left',
        zIndex: 50,
        animation: 'aeSpatialIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.8))',
      }}>
        {/* 3D Rendered Frame Background */}
        <div style={{
          position: 'relative',
          width: isPreview ? 340 : 750,
          height: isPreview ? 100 : 220,
        }}>
          {/* The photorealistic 3D rendered image */}
          <img
            src={assetUrl}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
              borderRadius: isReligious ? 4 : 0,
              pointerEvents: 'none',
            }}
            draggable={false}
          />

          {/* Animated specular light sweep over the rendered frame */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 45%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.15) 55%, transparent 60%)',
            animation: 'aeSpecularSweep 4s ease-in-out infinite',
            pointerEvents: 'none',
            mixBlendMode: 'overlay',
          }} />

          {/* Dynamic Text Overlay on the rendered frame */}
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: isPreview
              ? (isReligious ? '8px 12px 8px 80px' : '8px 16px 8px 16px')
              : (isReligious ? '16px 24px 16px 180px' : '16px 40px 16px 40px'),
          }}>
            {/* Badge Tag */}
            {badge && !isReligious && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                alignSelf: 'flex-start',
                padding: isPreview ? '2px 8px' : '4px 16px',
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(8px)',
                borderRadius: 3,
                marginBottom: isPreview ? 3 : 6,
                border: '1px solid rgba(255,255,255,0.2)',
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#ef4444',
                  boxShadow: '0 0 8px #ef4444',
                  animation: 'pulse 1.2s infinite',
                }} />
                <span style={{
                  color: '#ffffff',
                  fontSize: isPreview ? '0.55rem' : '0.85rem',
                  fontWeight: 800,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                }}>{badge}</span>
              </div>
            )}

            {/* Primary Name */}
            <div style={{
              color: titleColor,
              fontSize: isPreview ? '1rem' : '2.2rem',
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: isReligious ? 1 : 2.5,
              fontFamily: "'Outfit', 'Montserrat', 'Inter', sans-serif",
              textShadow: titleShadow,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.2,
            }}>
              {title}
            </div>

            {/* Subtitle / Designation */}
            {subtitle && (
              <div style={{
                color: subtitleColor,
                fontSize: isPreview ? '0.65rem' : '1.15rem',
                fontWeight: 600,
                letterSpacing: 1,
                marginTop: isPreview ? 2 : 4,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                textShadow: isReligious
                  ? '0 1px 2px rgba(200,150,50,0.3)'
                  : '0 1px 4px rgba(0,0,0,0.8)',
              }}>
                {!isReligious && <span style={{ color: isNews ? '#60a5fa' : '#94a3b8', marginRight: 6, fontWeight: 900 }}>//</span>}
                {subtitle}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 2. BREAKING NEWS BANNER — 3D Rendered Red Metallic
  // ═══════════════════════════════════════════════════════════
  if (gfx.type === 'banner') {
    const label = getText('label', 'BREAKING NEWS');
    const headline = getText('headline', 'Live Global Broadcast in Session • Watch Continuous Coverage');

    return (
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        transform: `scale(${scale})`,
        transformOrigin: 'bottom center',
        zIndex: 55,
        animation: 'aeBannerSlide 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        filter: 'drop-shadow(0 -15px 35px rgba(0,0,0,0.9))',
      }}>
        {/* 3D Rendered Breaking News Bar */}
        <div style={{
          position: 'relative',
          width: '100%',
          height: isPreview ? 60 : 130,
          overflow: 'hidden',
        }}>
          <img
            src={`${GRAPHICS_BASE}/banner_breaking_news.jpg`}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
              pointerEvents: 'none',
            }}
            draggable={false}
          />

          {/* Pulsing red glow overlay */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at 20% 50%, rgba(239,68,68,0.3) 0%, transparent 60%)',
            animation: 'pulse 2s ease-in-out infinite',
            pointerEvents: 'none',
          }} />

          {/* Text overlay on the rendered banner */}
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            padding: isPreview ? '0 14px' : '0 40px',
            gap: isPreview ? 12 : 28,
          }}>
            {/* Alert Badge */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: isPreview ? '4px 10px' : '10px 24px',
              background: 'rgba(0,0,0,0.8)',
              borderRadius: 6,
              border: '1px solid rgba(239,68,68,0.6)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: '#ef4444',
                boxShadow: '0 0 12px #ef4444',
                animation: 'pulse 1s infinite',
              }} />
              <span style={{
                color: '#fef08a',
                fontSize: isPreview ? '0.65rem' : '1.3rem',
                fontWeight: 900,
                letterSpacing: 2,
                textTransform: 'uppercase',
                textShadow: '0 2px 4px rgba(0,0,0,0.9)',
              }}>{label}</span>
            </div>

            {/* Headline */}
            <div style={{
              flex: 1,
              color: '#ffffff',
              fontSize: isPreview ? '0.75rem' : '1.5rem',
              fontWeight: 800,
              letterSpacing: 1,
              fontFamily: "'Outfit', 'Inter', sans-serif",
              textShadow: '0 2px 10px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.5)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {headline}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 3. SCORE BUG — 3D Rendered Futuristic Scoreboard
  // ═══════════════════════════════════════════════════════════
  if (gfx.type === 'score') {
    const team1 = getText('team1', 'MUMBAI TITANS');
    const score1 = getText('score1', '3');
    const team2 = getText('team2', 'DELHI STRIKERS');
    const score2 = getText('score2', '2');
    const clock = getText('clock', 'Q4 02:45');

    return (
      <div style={{
        position: 'absolute',
        top: isPreview ? 8 : 30,
        left: '50%',
        transform: `translateX(-50%) scale(${scale})`,
        transformOrigin: 'top center',
        zIndex: 50,
        animation: 'aeSpatialIn 0.5s ease-out forwards',
        filter: 'drop-shadow(0 15px 30px rgba(0,0,0,0.9))',
      }}>
        <div style={{
          position: 'relative',
          width: isPreview ? 360 : 800,
          height: isPreview ? 90 : 200,
        }}>
          <img
            src={`${GRAPHICS_BASE}/lt_sports_scorebug.jpg`}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
              borderRadius: 8,
              pointerEvents: 'none',
            }}
            draggable={false}
          />

          {/* Animated HUD shimmer */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(105deg, transparent 35%, rgba(6,182,212,0.1) 45%, rgba(6,182,212,0.2) 50%, rgba(6,182,212,0.1) 55%, transparent 65%)',
            animation: 'aeSpecularSweep 5s ease-in-out infinite',
            borderRadius: 8,
            pointerEvents: 'none',
          }} />

          {/* Score text overlay */}
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: isPreview ? 16 : 40,
            padding: isPreview ? '0 20px' : '0 60px',
          }}>
            {/* Team 1 */}
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{
                fontSize: isPreview ? '0.6rem' : '1.1rem',
                fontWeight: 900,
                color: '#93c5fd',
                letterSpacing: 2,
                textShadow: '0 2px 6px rgba(0,0,0,0.9)',
                textTransform: 'uppercase',
              }}>{team1}</div>
              <div style={{
                fontSize: isPreview ? '1.4rem' : '3.2rem',
                fontWeight: 900,
                color: '#ffffff',
                fontFamily: "'Outfit', monospace",
                textShadow: '0 0 20px rgba(6,182,212,0.6), 0 4px 8px rgba(0,0,0,0.9)',
              }}>{score1}</div>
            </div>

            {/* VS / Clock */}
            <div style={{ textAlign: 'center', minWidth: isPreview ? 50 : 100 }}>
              <div style={{
                fontSize: isPreview ? '0.5rem' : '0.9rem',
                fontWeight: 900,
                color: '#22d3ee',
                fontFamily: 'monospace',
                letterSpacing: 2,
                textShadow: '0 0 10px rgba(34,211,238,0.8)',
              }}>{clock}</div>
              <div style={{
                fontSize: isPreview ? '0.8rem' : '1.6rem',
                fontWeight: 900,
                color: '#ef4444',
                textShadow: '0 0 10px rgba(239,68,68,0.5)',
                marginTop: 2,
              }}>VS</div>
            </div>

            {/* Team 2 */}
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{
                fontSize: isPreview ? '0.6rem' : '1.1rem',
                fontWeight: 900,
                color: '#f9a8d4',
                letterSpacing: 2,
                textShadow: '0 2px 6px rgba(0,0,0,0.9)',
                textTransform: 'uppercase',
              }}>{team2}</div>
              <div style={{
                fontSize: isPreview ? '1.4rem' : '3.2rem',
                fontWeight: 900,
                color: '#ffffff',
                fontFamily: "'Outfit', monospace",
                textShadow: '0 0 20px rgba(6,182,212,0.6), 0 4px 8px rgba(0,0,0,0.9)',
              }}>{score2}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 4. TICKER MARQUEE — 3D Rendered Chrome LED Bar
  // ═══════════════════════════════════════════════════════════
  if (gfx.type === 'ticker') {
    const label = getText('label', 'LIVE UPDATES');
    const text = getText('text', 'Welcome to Loyadham Live Global Broadcast • Multi-Camera Production');

    return (
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        transform: `scale(${scale})`,
        transformOrigin: 'bottom center',
        zIndex: 55,
        filter: 'drop-shadow(0 -10px 30px rgba(0,0,0,0.85))',
      }}>
        <div style={{
          position: 'relative',
          width: '100%',
          height: isPreview ? 48 : 100,
          overflow: 'hidden',
        }}>
          <img
            src={`${GRAPHICS_BASE}/ticker_bar_premium.jpg`}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center bottom',
              pointerEvents: 'none',
            }}
            draggable={false}
          />

          {/* Holographic shimmer */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, transparent 0%, rgba(56,189,248,0.08) 30%, rgba(129,140,248,0.08) 70%, transparent 100%)',
            animation: 'aeSpecularSweep 6s linear infinite',
            pointerEvents: 'none',
          }} />

          {/* Text content */}
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            padding: isPreview ? '0 10px' : '0 20px',
          }}>
            {/* Badge */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: isPreview ? '3px 10px' : '8px 22px',
              background: isReligious
                ? 'linear-gradient(135deg, #b45309 0%, #d97706 100%)'
                : 'linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%)',
              borderRadius: 4,
              marginRight: isPreview ? 10 : 20,
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            }}>
              <span style={{
                color: '#ffffff',
                fontWeight: 900,
                fontSize: isPreview ? '0.6rem' : '1rem',
                letterSpacing: 2,
                textTransform: 'uppercase',
              }}>{label}</span>
            </div>

            {/* Marquee */}
            <div style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap' }}>
              <div style={{
                display: 'inline-block',
                animation: 'tickerMarquee 24s linear infinite',
                color: '#ffffff',
                fontSize: isPreview ? '0.7rem' : '1.2rem',
                fontWeight: 600,
                letterSpacing: 1,
                textShadow: '0 2px 6px rgba(0,0,0,0.9)',
              }}>
                {text}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 5. DEVOTIONAL SHLOKA / SCRIPTURE — Sacred Gold Frame
  // ═══════════════════════════════════════════════════════════
  if (gfx.type === 'verse') {
    const verse = getText('verse', 'Sacred Shloka and Divine Teachings');
    const reference = getText('reference', '— Loyadham Divine Updesh');

    return (
      <div style={{
        position: 'absolute',
        bottom: isPreview ? '6%' : '10%',
        left: '50%',
        transform: `translateX(-50%) scale(${scale})`,
        transformOrigin: 'bottom center',
        zIndex: 50,
        animation: 'aeSpatialIn 0.6s ease-out forwards',
        filter: 'drop-shadow(0 20px 50px rgba(0,0,0,0.9))',
      }}>
        <div style={{
          position: 'relative',
          width: isPreview ? 380 : 900,
          height: isPreview ? 120 : 280,
        }}>
          <img
            src={`${GRAPHICS_BASE}/lt_sacred_gold.jpg`}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
              borderRadius: 6,
              pointerEvents: 'none',
            }}
            draggable={false}
          />

          {/* Golden aura glow */}
          <div style={{
            position: 'absolute',
            inset: -10,
            background: 'radial-gradient(ellipse at center, rgba(245,158,11,0.2) 0%, transparent 70%)',
            animation: 'aeGoldAura 3s ease-in-out infinite',
            pointerEvents: 'none',
          }} />

          {/* Light sweep */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(105deg, transparent 35%, rgba(254,240,138,0.15) 45%, rgba(254,240,138,0.3) 50%, rgba(254,240,138,0.15) 55%, transparent 65%)',
            animation: 'aeSpecularSweep 5s ease-in-out infinite',
            borderRadius: 6,
            pointerEvents: 'none',
            mixBlendMode: 'overlay',
          }} />

          {/* Text overlay */}
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: isPreview ? '10px 60px 10px 90px' : '24px 100px 24px 200px',
          }}>
            <div style={{
              fontSize: isPreview ? '0.75rem' : '1.6rem',
              fontWeight: 600,
              color: '#fffbeb',
              fontStyle: 'italic',
              lineHeight: 1.5,
              fontFamily: "'Playfair Display', Georgia, serif",
              textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 20px rgba(245,158,11,0.4)',
            }}>
              "{verse}"
            </div>
            {reference && (
              <div style={{
                marginTop: isPreview ? 4 : 10,
                fontSize: isPreview ? '0.55rem' : '1rem',
                fontWeight: 800,
                color: '#fef08a',
                letterSpacing: 2,
                textTransform: 'uppercase',
                textShadow: '0 0 10px rgba(245,158,11,0.6), 0 2px 4px rgba(0,0,0,0.9)',
              }}>
                {reference}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 6. FULL SCREEN TITLE — Cinematic Sacred Geometry
  // ═══════════════════════════════════════════════════════════
  if (gfx.type === 'title') {
    const title = getText('title', 'Special Broadcast Event');
    const subtitle = getText('subtitle', 'Worldwide Live Transmission');

    return (
      <div style={{
        position: 'absolute',
        inset: 0,
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
        zIndex: 50,
        animation: 'fadeIn 0.7s ease-out forwards',
        overflow: 'hidden',
      }}>
        {/* Cinematic rendered background */}
        <img
          src={`${GRAPHICS_BASE}/fullscreen_title_card.jpg`}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            pointerEvents: 'none',
          }}
          draggable={false}
        />

        {/* Slow subtle zoom animation on background */}
        <div style={{
          position: 'absolute',
          inset: -20,
          background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.6) 100%)',
          pointerEvents: 'none',
        }} />

        {/* Anamorphic lens flare streak */}
        <div style={{
          position: 'absolute',
          top: '48%',
          left: '-10%',
          right: '-10%',
          height: 3,
          background: 'linear-gradient(90deg, transparent 0%, rgba(56,189,248,0.4) 20%, rgba(255,255,255,0.8) 50%, rgba(56,189,248,0.4) 80%, transparent 100%)',
          boxShadow: '0 0 30px rgba(56,189,248,0.5), 0 0 60px rgba(56,189,248,0.3)',
          animation: 'aeSpecularSweep 8s ease-in-out infinite',
          pointerEvents: 'none',
        }} />

        {/* Title text centered */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: isPreview ? 16 : 60,
        }}>
          <div style={{
            fontSize: isPreview ? '1.3rem' : '4.5rem',
            fontWeight: 900,
            color: '#ffffff',
            letterSpacing: 4,
            textTransform: 'uppercase',
            fontFamily: "'Outfit', 'Montserrat', sans-serif",
            textShadow: '0 0 40px rgba(99,102,241,0.6), 0 0 80px rgba(56,189,248,0.3), 0 10px 30px rgba(0,0,0,0.9)',
            maxWidth: 1200,
            lineHeight: 1.1,
          }}>
            {title}
          </div>

          {subtitle && (
            <div style={{
              fontSize: isPreview ? '0.7rem' : '1.8rem',
              color: '#93c5fd',
              marginTop: isPreview ? 6 : 20,
              fontWeight: 600,
              letterSpacing: 3,
              textTransform: 'uppercase',
              maxWidth: 1000,
              textShadow: '0 0 20px rgba(56,189,248,0.5), 0 2px 15px rgba(0,0,0,0.8)',
            }}>
              {subtitle}
            </div>
          )}

          {/* Decorative line below */}
          <div style={{
            width: isPreview ? 100 : 300,
            height: 2,
            background: 'linear-gradient(90deg, transparent 0%, #818cf8 30%, #ffffff 50%, #818cf8 70%, transparent 100%)',
            boxShadow: '0 0 15px rgba(129,140,248,0.5)',
            marginTop: isPreview ? 8 : 24,
          }} />
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 7. COUNTDOWN — Digital HUD with Rendered Background
  // ═══════════════════════════════════════════════════════════
  if (gfx.type === 'countdown') {
    const is10s = gfx.id?.includes('10s');
    const label = getText('label', is10s ? 'GOING LIVE IN' : 'STREAM STARTING IN');
    const subtitle = getText('subtitle', 'Loyadham Live Multi-Camera Studio');

    return (
      <div style={{
        position: 'absolute',
        inset: 0,
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
        zIndex: 50,
        animation: 'fadeIn 0.5s ease-out forwards',
        overflow: 'hidden',
      }}>
        {/* Dark cinematic background */}
        <img
          src={`${GRAPHICS_BASE}/fullscreen_title_card.jpg`}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0.6,
            filter: 'blur(3px)',
            pointerEvents: 'none',
          }}
          draggable={false}
        />

        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, rgba(8,12,22,0.7) 0%, rgba(2,6,23,0.95) 100%)',
        }} />

        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        }}>
          {/* HUD ring decoration */}
          <div style={{
            width: isPreview ? 120 : 300,
            height: isPreview ? 120 : 300,
            borderRadius: '50%',
            border: '2px solid rgba(56,189,248,0.3)',
            boxShadow: '0 0 40px rgba(56,189,248,0.2), inset 0 0 40px rgba(56,189,248,0.1)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}>
            {/* Rotating outer ring */}
            <div style={{
              position: 'absolute',
              inset: -8,
              borderRadius: '50%',
              border: '1px solid rgba(56,189,248,0.15)',
              borderTop: '2px solid #38bdf8',
              animation: 'spin 3s linear infinite',
            }} />

            <div style={{
              fontSize: isPreview ? '0.55rem' : '1rem',
              fontWeight: 900,
              color: '#94a3b8',
              letterSpacing: 3,
              textTransform: 'uppercase',
              marginBottom: isPreview ? 2 : 8,
            }}>
              {label}
            </div>

            <div style={{
              fontSize: isPreview ? '2rem' : '5.5rem',
              fontWeight: 900,
              color: '#38bdf8',
              fontFamily: "'Outfit', monospace",
              textShadow: '0 0 40px rgba(56,189,248,0.7), 0 0 80px rgba(56,189,248,0.3)',
              letterSpacing: 4,
              lineHeight: 1,
            }}>
              {is10s ? '00:10' : '00:30'}
            </div>

            <div style={{
              fontSize: isPreview ? '0.5rem' : '1rem',
              color: '#cbd5e1',
              fontWeight: 600,
              letterSpacing: 1,
              marginTop: isPreview ? 2 : 8,
            }}>
              {subtitle}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 8. LOGO BUG — Chrome Glass Corner Watermark
  // ═══════════════════════════════════════════════════════════
  if (gfx.type === 'logo' || gfx.type === 'bug') {
    const logoText = getText('text', getText('title', 'LIVE'));

    return (
      <div style={{
        position: 'absolute',
        top: isPreview ? 8 : 24,
        right: isPreview ? 8 : 24,
        transform: `scale(${scale})`,
        transformOrigin: 'top right',
        zIndex: 50,
        animation: 'fadeIn 0.5s ease-out forwards',
        filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.7))',
      }}>
        <div style={{
          position: 'relative',
          width: isPreview ? 60 : 140,
          height: isPreview ? 60 : 140,
        }}>
          <img
            src={`${GRAPHICS_BASE}/logo_bug_corner.jpg`}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              pointerEvents: 'none',
            }}
            draggable={false}
          />
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{
              color: '#ffffff',
              fontSize: isPreview ? '0.5rem' : '1rem',
              fontWeight: 900,
              letterSpacing: 2,
              textShadow: '0 2px 6px rgba(0,0,0,0.9)',
            }}>{logoText}</span>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
