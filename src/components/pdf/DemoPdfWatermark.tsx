import { StyleSheet, Text, View } from '@react-pdf/renderer'
import {
  DEMO_DOCUMENT_NOTICE,
  IS_DEMO_ENVIRONMENT,
} from '@/src/lib/demo-environment'

const styles = StyleSheet.create({
  watermark: {
    position: 'absolute',
    top: '39%',
    left: -60,
    right: -60,
    zIndex: 999,
    alignItems: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#b91c1c',
    paddingVertical: 10,
    opacity: 0.16,
    transform: 'rotate(-28deg)',
  },
  title: {
    color: '#991b1b',
    fontSize: 38,
    fontWeight: 'bold',
    letterSpacing: 2.4,
    textAlign: 'center',
  },
  disclaimer: {
    marginTop: 5,
    color: '#991b1b',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
})

export function DemoPdfWatermark() {
  if (!IS_DEMO_ENVIRONMENT) return null

  return (
    <View style={styles.watermark} fixed>
      <Text style={styles.title}>AMBIENTE DEMO</Text>
      <Text style={styles.disclaimer}>
        {DEMO_DOCUMENT_NOTICE}
      </Text>
    </View>
  )
}
