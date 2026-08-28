import MonthEndSupportingData from '@/components/month-end-supporting-data';
export default function MonthEndLayout({children}:{children:React.ReactNode}){return <div className="space-y-6">{children}<MonthEndSupportingData/></div>}
