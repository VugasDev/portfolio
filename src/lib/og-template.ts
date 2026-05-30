export interface OgTemplateProps {
  title: string;
  kicker: string;
}

// satori-VNode (manuelles Element-Objekt, kein JSX). Tactical-Look, 1200x630.
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
        backgroundColor: '#0A0A0A',
        padding: '72px 80px',
        color: '#EAEAEA',
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
              fontSize: '26px',
              letterSpacing: '6px',
              color: '#5A5A5A',
              textTransform: 'uppercase',
            },
            children: [
              { type: 'div', props: { style: { width: '22px', height: '22px', backgroundColor: '#E61919' }, children: '' } },
              { type: 'div', props: { children: kicker } },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              fontFamily: 'Archivo Black',
              fontSize: '96px',
              lineHeight: '1.02',
              letterSpacing: '-2px',
              color: '#EAEAEA',
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
              fontSize: '24px',
              letterSpacing: '4px',
              color: '#8A8A8A',
              borderTop: '2px solid #2A2A2A',
              paddingTop: '28px',
              textTransform: 'uppercase',
            },
            children: [
              { type: 'div', props: { children: 'VUGAS.DE' } },
              { type: 'div', props: { style: { color: '#E61919' }, children: 'UNIT-01' } },
            ],
          },
        },
      ],
    },
  };
}
