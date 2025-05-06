import { useState, useEffect, useRef } from 'react';
import { Calendar, Users, Search, ChevronLeft, ChevronRight, X, AlertCircle, DownloadIcon, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { dataService } from 'librechat-data-provider';
import { useGetAgentByIdQuery } from '~/data-provider';

interface AnalyticsResponse {
    data?: any[];
    pagination?: {
        total: number;
        page: number;
        limit: number;
        pages: number;
    };
}
export default function SimplifiedDashboard() {
    const navigate = useNavigate();
    const [theme, setTheme] = useState('light');
    const [searchUser, setSearchUser] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [showDateModal, setShowDateModal] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [displayDateRange, setDisplayDateRange] = useState('Select Date Range');
    const [dateError, setDateError] = useState('');
    const [tempStartDate, setTempStartDate] = useState('');
    const [tempEndDate, setTempEndDate] = useState('');

    interface AnalyticsData {
        userName: string;
        totalTokens: number;
        [key: string]: any;
    }

    const [analyticsData, setAnalyticsData] = useState<AnalyticsData[]>([]);
    const [pagination, setPagination] = useState<any>({ total: 0, page: 1, limit: 10, pages: 1 });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const itemsPerPage = 10;

    const [debouncedSearch, setDebouncedSearch] = useState(searchUser);
    const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
        }
        debounceTimeout.current = setTimeout(() => {
            setDebouncedSearch(searchUser);
            setCurrentPage(1);
        }, 1000);

        return () => clearTimeout(debounceTimeout.current as NodeJS.Timeout);
    }, [searchUser]);
    const agents = useGetAgentByIdQuery();

    const fetchAnalyticsData = async () => {
        setIsLoading(true);
        setError('');
        setAnalyticsData([]); // Clear data until filtering and matching is complete
        try {
            const params = new URLSearchParams({
                username: debouncedSearch.trim(),
                page: currentPage.toString(),
                limit: itemsPerPage.toString(),
                ...(startDate && { fromDate: startDate }),
                ...(endDate && { toDate: endDate }),
            });
            const response = (await dataService.getAnalytics(Object.fromEntries(params.entries()))) as AnalyticsResponse;
            const analyticsData = response?.data || [];

            // Map agent IDs to agent names only if agents data is available
            const updatedAnalyticsData = analyticsData.map((item) => {
                const updatedItem = { ...item };
                if (agents.isSuccess && agents.data?.data) {
                    Object.keys(item).forEach((key) => {
                        const agent = agents.data.data.find((agent) => agent.id === key);
                        if (agent) {
                            updatedItem[agent.name] = updatedItem[key];
                            delete updatedItem[key];
                        }
                    });
                }
                return updatedItem;
            });

            const paginationData =
                response?.pagination || { total: 0, page: 1, limit: itemsPerPage, pages: 1 };
            setAnalyticsData(updatedAnalyticsData); // Set data only after processing
            setPagination(paginationData);
        } catch (err) {
            console.error('Error fetching analytics data:', err);
            setError('Failed to load analytics data. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (agents.isSuccess) {
            fetchAnalyticsData();
        }
    }, [debouncedSearch, currentPage, startDate, endDate, agents.isSuccess]);

    useEffect(() => {
        const getCurrentTheme = () => {
            const storedTheme = localStorage.getItem('color-theme');
            return (storedTheme === 'dark' || storedTheme === 'light') ? storedTheme : 'light';
        };
        setTheme(getCurrentTheme());
        const observer = new MutationObserver(() => {
            setTheme(getCurrentTheme());
        });
        if (document.documentElement) {
            observer.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['class', 'data-theme']
            });
        }
        const handleStorageChange = (e) => {
            if (e.key === 'color-theme') {
                const newTheme = e.newValue;
                if (newTheme === 'light' || newTheme === 'dark') {
                    setTheme(newTheme);
                }
            }
        };
        window.addEventListener('storage', handleStorageChange);
        const handleThemeChange = () => {
            setTheme(getCurrentTheme());
        };
        window.addEventListener('themeChange', handleThemeChange);
        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('themeChange', handleThemeChange);
            observer.disconnect();
        };
    }, []);

    useEffect(() => {
        validateDates(tempStartDate, tempEndDate);
    }, [tempStartDate, tempEndDate]);

    const validateDates = (start: string, end: string) => {
        if (start && end) {
            const startDateObj = new Date(start);
            const endDateObj = new Date(end);
            if (endDateObj < startDateObj) {
                setDateError('End date cannot be earlier than start date');
                return false;
            }
        }
        setDateError('');
        return true;
    };

    const handleTempStartDateChange = (e) => {
        setTempStartDate(e.target.value);
    };

    const handleTempEndDateChange = (e) => {
        setTempEndDate(e.target.value);
    };

    const handleSearchChange = (e) => {
        setSearchUser(e.target.value);
    };

    const handleApplyDateFilter = () => {
        if (validateDates(tempStartDate, tempEndDate)) {
            setStartDate(tempStartDate);
            setEndDate(tempEndDate);
            setDisplayDateRange(tempStartDate && tempEndDate ? `${tempStartDate} to ${tempEndDate}` : 'Select Date Range');
            setShowDateModal(false);
            setCurrentPage(1);
        }
    };

    const handleDownloadCSV = async () => {
        try {
            const params = new URLSearchParams();
            if (searchUser?.trim()) {
                params.append('username', searchUser.trim());
            }
            if (startDate) {
                params.append('fromDate', startDate);
            }
            if (endDate) {
                params.append('toDate', endDate);
            }
            const response = await dataService.getDownloadCSV(Object.fromEntries(params.entries()));
        } catch (error) {
            console.error('Error downloading CSV:', error);
            setError('Failed to download CSV. Please try again.');
        }
    };

    const handleDownloadExcel = async () => {
        try {
            const params = new URLSearchParams();
            if (searchUser?.trim()) {
                params.append('username', searchUser.trim());
            }
            if (startDate) {
                params.append('fromDate', startDate);
            }
            if (endDate) {
                params.append('toDate', endDate);
            }
            const response = await dataService.getDownloadExcel(Object.fromEntries(params.entries()));
        } catch (error) {
            console.error('Error downloading Excel:', error);
            setError('Failed to download Excel. Please try again.');
        }
    };

    const paginate = (pageNumber) => {
        if (pageNumber > 0 && pageNumber <= pagination.pages) {
            setCurrentPage(pageNumber);
        }
    };

    const modelNames = Array.from(
        new Set(
            analyticsData.flatMap(user =>
                Object.keys(user || {}).filter(key => key !== 'userName' && key !== 'totalTokens')
            )
        )
    );

    const getThemeClasses = {
        container: theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-800',
        header: theme === 'dark'
            ? 'bg-gradient-to-r from-gray-800 to-gray-900'
            : 'bg-gradient-to-r from-white to-gray-100',
        card: theme === 'dark' ? 'bg-gray-800 shadow-lg' : 'bg-white shadow',
        heading: theme === 'dark' ? 'text-gray-100' : 'text-gray-800',
        subHeading: theme === 'dark' ? 'text-gray-300' : 'text-gray-600',
        tableHeader: theme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-50 text-gray-500',
        tableRow: theme === 'dark' ? 'bg-gray-800 text-gray-200 hover:bg-gray-700' : 'bg-white text-gray-900 hover:bg-gray-50',
        tableCell: theme === 'dark' ? 'text-gray-300' : 'text-gray-500',
        input: theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300 text-gray-700',
        button: theme === 'dark' ? 'bg-blue-700 hover:bg-blue-800' : 'bg-blue-600 hover:bg-blue-700',
        icon: theme === 'dark' ? 'text-blue-400' : 'text-blue-600',
        footer: theme === 'dark' ? 'text-gray-400' : 'text-gray-500',
        border: theme === 'dark' ? 'border-gray-700' : 'border-gray-200',
        divider: theme === 'dark' ? 'divide-gray-700' : 'divide-gray-200',
        pagination: theme === 'dark' ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700',
        paginationActive: theme === 'dark' ? 'bg-blue-800 text-white' : 'bg-blue-500 text-white',
        modal: theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200',
        overlay: theme === 'dark' ? 'bg-gray-900 bg-opacity-75' : 'bg-gray-500 bg-opacity-75',
        dateButton: theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700',
        error: theme === 'dark' ? 'text-red-400' : 'text-red-600'
    };

    return (
        <div className={`min-h-screen p-6 ${getThemeClasses.container}`}>
            <header className={`mb-8 flex items-center justify-between p-6 rounded-xl shadow-lg ${getThemeClasses.header}`}>
                <div className="flex items-center space-x-4">
                    <button
                        onClick={() => navigate('/')}
                        className={`p-2 rounded-full hover:bg-black/10 dark:hover:bg-gray-700 transition-colors`}
                        aria-label="Go back"
                    >
                        <ArrowLeft className={`w-6 h-6 ${theme === 'dark' ? 'text-gray-200' : 'text-black'}`} />
                    </button>
                    <div>
                        <h1 className={`text-3xl font-bold tracking-tight inline-flex items-center ${theme === 'dark' ? 'text-gray-100' : 'text-black'}`}>
                            LibreChat Analytics Dashboard
                        </h1>
                        <p className={`text-lg mt-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                            User token usage metrics
                        </p>
                    </div>
                </div>
            </header>
            <div className={`p-4 rounded-lg mb-6 ${getThemeClasses.card}`}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex-grow lg:flex-grow-0 lg:w-1/2">
                        <div className="flex items-center">
                            <Search className={`w-5 h-5 mr-2 ${getThemeClasses.icon}`} />
                            <div className="w-full">
                                <input
                                    type="text"
                                    placeholder="Search users by name..."
                                    className={`border rounded-md p-2 text-sm w-full ${getThemeClasses.input}`}
                                    value={searchUser}
                                    onChange={handleSearchChange}
                                />
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            className={`px-4 py-2 rounded-md text-sm flex items-center ${getThemeClasses.dateButton}`}
                            onClick={() => setShowDateModal(true)}
                        >
                            <Calendar className={`w-4 h-4 mr-2 ${getThemeClasses.icon}`} />
                            {displayDateRange}
                        </button>
                        <button
                            onClick={handleDownloadCSV}
                            className={`text-white px-4 py-2 rounded-md text-sm flex items-center ${getThemeClasses.button}`}
                        >
                            <DownloadIcon className="w-4 h-4 mr-1" />
                            Download CSV
                        </button>
                        <button
                            onClick={handleDownloadExcel}
                            className={`text-white px-4 py-2 rounded-md text-sm flex items-center ${getThemeClasses.button}`}
                        >
                            <DownloadIcon className="w-4 h-4 mr-1" />
                            Download Statistics
                        </button>
                    </div>
                </div>
            </div>
            <div className={`rounded-lg mb-6 overflow-hidden ${getThemeClasses.card}`}>
                <div className={`p-4 border-b flex justify-between items-center ${getThemeClasses.border}`}>
                    <h2 className={`text-lg font-semibold flex items-center ${getThemeClasses.heading}`}>
                        <Users className={`w-5 h-5 mr-2 ${getThemeClasses.icon}`} />
                        User Token Usage
                    </h2>
                </div>
                <div className="p-4">
                    {isLoading && (
                        <div className="text-center py-4">Loading...</div>
                    )}
                    {error && (
                        <div className={`flex items-center py-4 text-sm ${getThemeClasses.error}`}>
                            <AlertCircle className="w-4 h-4 mr-1" />
                            {error}
                        </div>
                    )}
                    {!isLoading && !error && analyticsData.length === 0 && (
                        <div className="text-center py-4">No data available for the selected filters.</div>
                    )}
                    {!isLoading && !error && analyticsData.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className={`min-w-full divide-y ${getThemeClasses.divider}`}>
                                <thead className={getThemeClasses.tableHeader}>
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">User</th>
                                        {modelNames.map((model) => (
                                            <th key={model} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                                                {model}
                                            </th>
                                        ))}
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Total</th>
                                    </tr>
                                </thead>
                                <tbody className={`divide-y ${getThemeClasses.divider}`}>
                                    {analyticsData.map((row, index) => (
                                        <tr key={index} className={getThemeClasses.tableRow}>
                                            <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${getThemeClasses.heading}`}>
                                                {row.userName || 'Unknown User'}
                                            </td>
                                            {modelNames.map((model) => (
                                                <td key={model} className={`px-6 py-4 whitespace-nowrap text-sm ${getThemeClasses.tableCell}`}>
                                                    {row[model] || 0}
                                                </td>
                                            ))}
                                            <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${getThemeClasses.heading}`}>
                                                {row.totalTokens || 0}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <div className="flex items-center justify-between border-t mt-4 pt-4">
                        <div className={`text-sm ${getThemeClasses.subHeading}`}>
                            {pagination.total === 0 ? (
                                'Showing 0 entries'
                            ) : (
                                <>
                                    Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                                    {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} entries
                                </>
                            )}
                        </div>
                        <div className="flex">
                            <button
                                onClick={() => paginate(currentPage - 1)}
                                disabled={currentPage === 1 || pagination.total === 0}
                                className={`${getThemeClasses.pagination} px-3 py-1 rounded-l-md ${currentPage === 1 || pagination.total === 0
                                        ? 'opacity-50 cursor-not-allowed'
                                        : 'hover:bg-gray-200 dark:hover:bg-gray-600'
                                    } flex items-center`}
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            {Array.from({ length: pagination.pages }, (_, i) => (
                                <button
                                    key={i + 1}
                                    onClick={() => paginate(i + 1)}
                                    className={`${currentPage === i + 1
                                            ? getThemeClasses.paginationActive
                                            : getThemeClasses.pagination
                                        } px-3 py-1`}
                                >
                                    {i + 1}
                                </button>
                            ))}
                            <button
                                onClick={() => paginate(currentPage + 1)}
                                disabled={currentPage === pagination.pages || pagination.total === 0}
                                className={`${getThemeClasses.pagination} px-3 py-1 rounded-r-md ${currentPage === pagination.pages || pagination.total === 0
                                        ? 'opacity-50 cursor-not-allowed'
                                        : 'hover:bg-gray-200 dark:hover:bg-gray-600'
                                    } flex items-center`}
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <footer className={`mt-8 text-center text-sm ${getThemeClasses.footer}`}>
                <p>LibreChat Analytics Dashboard • Last updated: April 30, 2025</p>
            </footer>
            {showDateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className={`absolute inset-0 ${getThemeClasses.overlay}`} onClick={() => setShowDateModal(false)}></div>
                    <div className={`relative rounded-lg shadow-lg max-w-md w-full p-6 ${getThemeClasses.modal} border`}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className={`text-lg font-medium ${getThemeClasses.heading}`}>Select Date Range</h3>
                            <button
                                onClick={() => setShowDateModal(false)}
                                className={`p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700`}
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className={`block text-sm font-medium mb-1 ${getThemeClasses.subHeading}`}>From Date</label>
                                <input
                                    type="date"
                                    className={`w-full rounded-md p-2 ${getThemeClasses.input} ${dateError ? 'border-red-500' : ''}`}
                                    value={tempStartDate}
                                    onChange={handleTempStartDateChange}
                                />
                            </div>
                            <div>
                                <label className={`block text-sm font-medium mb-1 ${getThemeClasses.subHeading}`}>To Date</label>
                                <input
                                    type="date"
                                    className={`w-full rounded-md p-2 ${getThemeClasses.input} ${dateError ? 'border-red-500' : ''}`}
                                    value={tempEndDate}
                                    onChange={handleTempEndDateChange}
                                />
                            </div>
                            {dateError && (
                                <div className={`flex items-center mt-2 text-sm ${getThemeClasses.error}`}>
                                    <AlertCircle className="w-4 h-4 mr-1" />
                                    {dateError}
                                </div>
                            )}
                            <div className="flex justify-end space-x-2 pt-4">
                                <button
                                    onClick={() => {
                                        setTempStartDate('');
                                        setTempEndDate('');
                                        setDisplayDateRange('Select Date Range');
                                        setDateError('');
                                        setShowDateModal(false);
                                        setStartDate('');
                                        setEndDate('');
                                    }}
                                    className={`px-4 py-2 border rounded-md ${getThemeClasses.dateButton}`}
                                >
                                    Clear
                                </button>
                                <button
                                    onClick={() => setShowDateModal(false)}
                                    className={`px-4 py-2 border rounded-md ${getThemeClasses.dateButton}`}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleApplyDateFilter}
                                    className={`px-4 py-2 rounded-md text-white ${getThemeClasses.button} ${dateError ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    disabled={!!dateError}
                                >
                                    Apply
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}