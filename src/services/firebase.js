import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInAnonymously } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            "AIzaSyCLB7z7lDPeNDa0qEYFVWXyCLlzNsJzrww",
  authDomain:        "delistars-domicilios.firebaseapp.com",
  projectId:         "delistars-domicilios",
  storageBucket:     "delistars-domicilios.firebasestorage.app",
  messagingSenderId: "757400771350",
  appId:             "1:757400771350:web:57cb5b1affd8e170850e37",
}

const app      = initializeApp(firebaseConfig)
export const auth         = getAuth(app)
export const db           = getFirestore(app)
export const provider     = new GoogleAuthProvider()
export const loginAnon    = () => signInAnonymously(auth)

provider.setCustomParameters({ prompt: 'select_account' })
