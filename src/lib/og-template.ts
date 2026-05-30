export interface OgTemplateProps {
  title: string;
  kicker: string;
}

// satori-VNode (manuelles Element-Objekt, kein JSX). Soft-Dusk-Look, 1200x630.
export function ogTemplate({ title, kicker }: OgTemplateProps) {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        background: 'linear-gradient(65deg,#241C38,#34264A,#5E3C68)',
        padding: '72px 80px',
        color: '#ECE6F4',
        fontFamily: 'JetBrains Mono',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              fontSize: '24px',
              letterSpacing: '6px',
              color: '#E7A8F0',
              textTransform: 'uppercase',
            },
            children: [
              { type: 'div', props: { style: { width: '18px', height: '18px', backgroundColor: '#E7A8F0', borderRadius: '50%' }, children: '' } },
              { type: 'div', props: { children: kicker } },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              fontFamily: 'Space Grotesk',
              fontSize: '88px',
              fontWeight: '700',
              lineHeight: '1.02',
              letterSpacing: '-2px',
              color: '#ECE6F4',
              maxWidth: '1040px',
            },
            children: title,
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '22px',
              letterSpacing: '4px',
              color: '#C9B8E0',
              borderTop: '1px solid rgba(255,255,255,0.15)',
              paddingTop: '28px',
              textTransform: 'uppercase',
            },
            children: [
              { type: 'div', props: { children: 'vugas.de' } },
              { type: 'div', props: { style: { color: '#E7A8F0' }, children: 'Homelab · AI · Self-Hosting' } },
            ],
          },
        },
      ],
    },
  };
}
